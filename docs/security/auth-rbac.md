# Authentication and RBAC

Status: drafted
Maps to: control-register rows 9, 10
Last reviewed: 2026-06-09

Who the caller is, and what they may do. Authentication proves identity; authorization decides capability. They are separate, and both are enforced server-side (ADR-011).

## Authentication

Login providers (Microsoft Entra, Google, email/password, magic link) prove identity. Supabase Auth brokers the session and issues an asymmetrically-signed (ES256) JWT. The control plane verifies that token against the Supabase JWKS public keys, enforces the issuer, and requires a subject, then extracts the user id ([auth.ts](../../apps/api/src/auth.ts) `authenticate`; ADR-020). A missing or invalid token is rejected before any handler runs.

Verifying against the published JWKS means the control plane holds no token-signing secret on the asymmetric path; the HS256 shared secret is retained only as a fallback for legacy tokens. Remaining hardening, tracked in [control-register.md](control-register.md): enforce the `aud` claim and confirm the exact hosted issuer string before production.

## Authorization (RBAC)

After identity, the control plane loads the caller's role in the target workspace and checks the required capability before the handler runs ([auth.ts](../../apps/api/src/auth.ts) `requireCapability`). Authority is checked where it cannot be bypassed by calling the API directly; the UI hiding a button is never the control.

Roles and capabilities ([packages/shared](../../packages/shared/src/index.ts)):

| Capability | owner | agent_admin | manager | member | read_only |
| --- | --- | --- | --- | --- | --- |
| read_records | yes | yes | yes | yes | yes |
| capture_update | yes | yes | yes | yes | no |
| approve_proposal | yes | yes | yes | no | no |
| publish_contract | yes | yes | no | no | no |

This mapping is a product decision that should be reviewed against requirements REQ-002.

## How it is proven

`tests/rbac-matrix.test.ts` asserts every endpoint, for every role, allows exactly its capabilities and rejects the rest, and that an unauthenticated request is rejected. It needs local Supabase (to mint user JWTs) and runs in CI.

## Boundaries

- Login is not Graph consent. Signing in with Microsoft grants no Graph access; that is a separate, per-feature consent step (ADR-012).
- The base product works with zero Graph permissions.
