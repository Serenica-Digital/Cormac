# ADR-011: Auth, Supabase broker, external providers, control-plane authorization

**Status:** Accepted
**Date:** 2026-06-06
**Related:** Uses ADR-003 (Supabase) for the session layer and feeds ADR-005 (the control plane is the only writer), which owns authorization. The Microsoft login path is kept distinct from the Graph consent of ADR-012, and the identity and RBAC model is part of the evidence in ADR-015 (security).

## Context

The target clients live in Microsoft 365, so Microsoft sign-in matters. At the same time, "authorization is owned by our backend" raised a fair worry: does that mean hand-rolling the entire identity stack. It does not, and the distinction that resolves it is between proving who a user is and deciding what they may do. Sessions, OAuth, password reset, magic links, and MFA are solved problems to delegate. The business-specific permission layer is the part every serious app writes itself.

There is a second, frequently-blurred distinction that this ADR pins down: signing in with Microsoft is not the same as granting the app access to Microsoft data. A user can authenticate with their Microsoft identity without giving the app any permission to read their workbooks, SharePoint, or mailbox.

## Decision

Supabase Auth is the application session broker; upstream identity providers handle the actual login; the control plane owns authorization.

### 1. The responsibility split

| Layer | Responsibility |
| --- | --- |
| Login providers (Microsoft Entra, Google, email/password, magic link; Apple later) | Prove who the user is |
| Supabase Auth | Broker the app session, normalize the provider login into an app user, issue the app JWT |
| Control plane | Decide what the user may do: workspace membership, role, permissions, feature and integration access |
| Postgres RLS and constraints | Backstop tenant isolation |
| Agent runtime | Never trusted for an auth decision |

Supabase Auth supports the full provider set (email and password, magic links and OTP, and social or enterprise OAuth including Microsoft/Azure, Google, and others), so a single broker covers the whole login matrix without bespoke session code.

### 2. The flow

On every protected request the control plane verifies the Supabase JWT, then loads workspace membership, role, and permissions, and decides before it invokes the runtime or writes data (ADR-005). The flow for Microsoft sign-in: the user picks "sign in with Microsoft," Supabase redirects to Entra, Entra verifies identity, Supabase receives the callback and issues the app session, the web app holds that session, and the control plane verifies it and checks workspace authorization.

### 3. Login is not Graph consent

Authenticating with Microsoft proves identity only. It does not grant access to workbooks, SharePoint, or Outlook. Microsoft Graph permissions are a separate, incremental consent step that happens when a user enables a connector feature (ADR-012). This separation is what lets a Microsoft user run the base product even when their tenant has granted no Graph permissions, which keeps onboarding unblocked.

## Consequences

- No password, session, OAuth, or MFA machinery is hand-built. What is hand-written is the authorization layer, which every serious app owns regardless of identity provider.
- Because login and Graph consent are cleanly separated, the connector levels in ADR-012 can be feature-gated without the base app ever depending on admin consent, which is central to the SMB market in ADR-016.
- The RBAC model, the JWT verification on every protected endpoint, and the RLS backstop are concrete controls the security packet evidences (ADR-015).

## Alternatives considered

**Validate Microsoft Entra JWTs directly in the control plane, with no broker.** Workable, and the right call only if a customer requires strict Microsoft-only identity from day one. Rejected as the default because it is more session plumbing for us (token validation, refresh, multi-provider handling) with no benefit at this stage, and it gives up the easy non-Microsoft login paths the pilot may want.

**Hand-roll auth.** Rejected outright. There is no reason to own password hashing, session issuance, OAuth callbacks, or MFA when a broker does it correctly.

**Clerk or Auth0 as the broker.** Viable and strong on enterprise SSO and SCIM. Set aside for v1 because Supabase Auth is already in the stack, Lovable understands it, and it ties cleanly to RLS. Revisited if and when enterprise identity requirements arrive, which the market posture deliberately defers (ADR-016).

## Open items

1. **Provider set for the pilot.** Likely email or magic link plus Microsoft, with Google and Apple added only on a real need.
2. **Enterprise identity later.** Whether to add Clerk or Auth0, or direct Entra SSO with SCIM provisioning, when a buyer needs it, and how that migrates off Supabase Auth without disrupting existing sessions.
