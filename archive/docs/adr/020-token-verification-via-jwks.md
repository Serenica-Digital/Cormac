# ADR-020: The control plane verifies user tokens against the Supabase JWKS

**Status:** Accepted (refines the verification mechanism ADR-011 left unspecified; open items 3 and 4 resolved 2026-06-10: the audience check is enforced and tested, and the hosted issuer is confirmed as the default `${SUPABASE_URL}/auth/v1`, ES256 via JWKS)
**Date:** 2026-06-07
**Related:** Refines ADR-011 (Supabase broker, control-plane authorization), which said the control plane "verifies the Supabase JWT" on every protected request without pinning how. It is the first gate in the only-writer path of ADR-005, a concrete control evidenced in [docs/security/auth-rbac.md](../security/auth-rbac.md) (ADR-015), and it is built in `apps/api` per ADR-018.

## Context

ADR-011 set the identity model: Supabase brokers the session and issues the app token, and the control plane verifies that token and then decides authorization. It did not specify the verification mechanism, and a reasonable default at the time would have been symmetric HS256 with the project's shared JWT secret, the long-standing Supabase pattern.

Building the skeleton surfaced that the current Supabase stack signs user access tokens **asymmetrically with ES256**, publishing the public keys at a JWKS endpoint (`/auth/v1/.well-known/jwks.json`), and that the legacy long-lived API keys (anon and service-role) remain HS256 JWTs signed with the shared secret. A verifier built only for the shared secret rejects every modern user token (the symptom that exposed this was a uniform 401 on every authenticated call, with the token's header showing `"alg":"ES256"` and a `kid`).

This is not merely a local-version quirk to work around. Asymmetric signing with a JWKS is the direction Supabase is moving and the more correct design: the control plane verifies with rotatable public keys it fetches, and never needs to hold the token-signing secret at all. Pinning the verification to the JWKS is therefore the right decision on its own merits, not a workaround.

## Decision

The control plane verifies bearer tokens against the Supabase JWKS, selecting the key by the token's algorithm so both signing schemes are accepted during Supabase's transition.

### 1. Verify against the published JWKS

At boot, the control plane builds a cached remote JWKS resolver from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (using `jose`'s `createRemoteJWKSet`, which caches keys and refetches on an unknown `kid`). That endpoint is public, so fetching keys needs no secret.

### 2. Select the key by algorithm, with HS256 as a fallback

On each request, the verifier inspects the token's `alg`:

- `HS256` is verified with the shared secret (`SUPABASE_JWT_SECRET`). This keeps older projects and any legacy HS256 user tokens working.
- Any other algorithm (the current `ES256`) is verified against the JWKS public key matching the token's `kid`.

This algorithm-directed resolver means a single code path accepts both the asymmetric tokens current Supabase issues and the symmetric tokens older configurations issue, without a deploy-time switch.

### 3. Enforce issuer; require a subject

Verification enforces `issuer = ${SUPABASE_URL}/auth/v1` and rejects any token without a subject claim. The subject becomes the authenticated user id that RBAC then resolves to a workspace membership and role (ADR-011, ADR-005). Verification proves only identity; authorization remains the control plane's separate, owned decision.

## Consequences

### Security

- For the common (asymmetric) path, the control plane holds no token-signing secret. It verifies signatures with public keys it fetches from the JWKS, so a compromise of the control plane does not leak the ability to mint tokens. This is a stronger posture than shared-secret verification and is the version recorded in the security packet (ADR-015, [auth-rbac.md](../security/auth-rbac.md)).
- The shared secret is retained only as the HS256 fallback. The anon and service-role keys remain HS256 JWTs, but those are API keys used by clients and the service role, not user tokens flowing through this gate.
- Every protected endpoint now verifies an asymmetric signature against the published keys with an issuer check before any workspace authorization runs, which is a concrete, evidenceable control rather than a described intent.

### Operational

- Key rotation is handled by the JWKS: when Supabase rotates signing keys, the resolver refetches on the unrecognized `kid`, so rotation needs no redeploy. The cache and refetch behavior is `jose`'s default and is recorded as an item to confirm under load.

## Alternatives considered

**HS256 only, with the shared secret.** The original implicit default. Rejected because it rejects every token current Supabase issues, and because it forces the control plane to hold the signing secret, which is exactly what asymmetric verification removes.

**Pin to ES256/JWKS only, drop the HS256 path.** Cleaner, but it would break any project or environment still on symmetric signing, including older hosted projects. The algorithm-directed fallback costs almost nothing and keeps both eras working, so the small extra branch is worth it until the platform fully retires HS256.

**Validate Microsoft Entra tokens directly in the control plane.** Already weighed and rejected in ADR-011 as more session plumbing with no benefit at this stage; unchanged here.

**Fetch the JWKS per request.** Rejected: build the resolver once at boot and let it cache, refetching only on an unknown key id. Per-request fetches would add latency and a hard dependency on the auth endpoint to every call.

## Open items

1. **Rotation behavior under load.** Confirm the JWKS cache window and refetch-on-unknown-`kid` behavior holds up when keys rotate during traffic, and whether to tune the cooldown.
2. **Algorithm allowlist.** Whether to explicitly allowlist accepted algorithms (`ES256`, `HS256`) rather than branch on `alg`, to remove any algorithm-confusion surface.
3. **Audience check.** Supabase sets `aud = authenticated`; decide whether to enforce it in addition to issuer. *Resolved 2026-06-10: enforced in `authenticate` and tested (a correctly-signed wrong-audience token is rejected before any database access).*
4. **Hosted issuer exactness.** Confirm the issuer string for hosted Supabase, including custom domains, so the issuer check is exact in production rather than only against the local `127.0.0.1` issuer. *Resolved 2026-06-10 against the managed dev project: tokens carry `iss = ${SUPABASE_URL}/auth/v1` exactly (no override needed), signed ES256 with a `kid` matching the published JWKS. A custom domain would change the issuer and reopen this.*
