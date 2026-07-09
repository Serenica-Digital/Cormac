# Identity and access

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

## Sign-in

Supabase Auth is the identity broker. Users sign in with Microsoft (Entra
ID) or Google OAuth, a magic link, or email + password; every door yields
the same session, and the control plane treats them identically. Adding or
removing a sign-in method never touches authorization.

## Identity verification (register row 8 — Verified)

Every protected endpoint verifies the bearer JWT: issuer, audience
(`authenticated`), and signature. Staging and beyond verify ES256 against
the published JWKS; the HS256 development branch is structurally refused
outside dev (`hsSecret` is null in prod-like environments), so the public
local secret cannot forge a token where it matters. Named caveat: automated
tests exercise the HS256 branch (what local Supabase signs); the ES256 path
is proven manually against the managed project, not in the suite.

## Roles and capabilities (rows 9-10 — Verified)

Five workspace roles map to capabilities in one shared vocabulary
(`@cormac/authz`), enforced by `requireCapability` on every route and
matrixed exhaustively in `apps/control-plane/tests/rbac-matrix.test.ts`:

| Role (client word) | capture | approve | publish contract | manage members | read |
| --- | --- | --- | --- | --- | --- |
| owner (Owner) | ✓ | ✓ | ✓ | ✓ | ✓ |
| agent_admin (Admin) | ✓ | ✓ | ✓ | ✓ | ✓ |
| manager (Manager) | ✓ | ✓ | — | — | ✓ |
| member (Member) | ✓ | — | — | — | ✓ |
| read_only (Viewer) | — | — | — | — | ✓ |

Member management holds three server-enforced invariants: the owner role is
granted and removed only by an owner; a workspace never drops to zero
owners; nobody changes their own role. Contract publishing is a
server-authoritative, atomic, audited gate (row 16 — Verified). Web read
routes run the same identity + authorization chain as writes (row 20 —
Verified).

The web UI mirrors these rules (hiding what a role cannot do), but that is
presentation: the server refuses regardless.

## The platform-operator tier (rows 7, 11 — Verified)

Serenica staff who administer tenants hold a `platform_admins` row and use a
separate `/api/operator/*` surface. The flag never bypasses workspace
authorization — an operator who is not a member of a workspace cannot read
its records — and operator responses never carry a token hash (asserted by a
regex sweep over response bodies).

## Future

SAML/enterprise SSO is not built and not committed; if a pilot requires it,
it rides the same broker (Supabase Auth) with no control-plane change. See
[known-gaps-and-roadmap.md](known-gaps-and-roadmap.md).
