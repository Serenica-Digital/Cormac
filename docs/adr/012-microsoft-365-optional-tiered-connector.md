# ADR-012: Microsoft 365 as an optional tiered connector

**Status:** Accepted
**Date:** 2026-06-06
**Related:** Keeps the Microsoft login of ADR-011 separate from Graph consent, provides live workbook access for ADR-004 (Excel Level 3), and its permission inventory and publisher-verification path are evidence for ADR-015 (security). The graceful-degradation posture is what makes the SMB market of ADR-016 reachable.

## Context

The target clients live in Outlook, Excel, OneDrive, and SharePoint, so deep Microsoft integration is valuable. The catch is that many small clients cannot complete a heavy Microsoft onboarding before the product works, and the reason is rarely the absence of a tenant. A business using Microsoft 365 almost certainly has an Entra tenant, whether or not anyone there knows the words. The friction is organizational (see [docs/research/microsoft-365-connector-architecture.md](../research/microsoft-365-connector-architecture.md)): nobody knows who the Microsoft admin is, an outside IT vendor or MSP controls the tenant, user consent to third-party apps is disabled, admin consent is required for the permissions we want, the app shows as an unverified publisher, or the client is on consumer Microsoft accounts rather than Microsoft 365 Business. The product cannot make any of that a hard dependency, and the design has to expect this to happen regularly.

## Decision

Hosted SaaS with an optional, feature-scoped Microsoft 365 connector and incremental consent.

### 1. Connector levels

| Level | Capability | Permission posture |
| --- | --- | --- |
| 0 | No Microsoft connection. SMS, web, Supabase, and manual Excel upload all work. | None. |
| 1 | Sign in with Microsoft, basic profile. | Low-friction identity (ADR-011). |
| 2 | Select a workbook or file from OneDrive or SharePoint. | User-driven selection, narrower than tenant-wide access. |
| 3 | Controlled sync of a selected workbook or table. | Read/write the selected resource, with sessions and conflict logic (ADR-004). |
| 4 | Outlook and email integration. | Privacy-sensitive; not bundled into basic onboarding. |
| 5 | Admin-approved organization connector, broader access. | Tenant admin consent; procurement-sensitive. |

Each level in the settings screen explains what it enables, what permission it requests, whether admin consent may be required, what data is read or written, and how to disconnect.

### 2. The base app needs no Graph consent

No single Graph permission can block the base product. The system works standalone, gets better when Microsoft is connected, and gets powerful when admin-approved. Because SMS, web, and manual Excel upload are the Level 0 baseline, a stalled Microsoft onboarding never blocks the rest of v1.

### 3. Product-owned registration, customer consent, least privilege

The platform owns one multi-tenant Microsoft Entra app registration. Customers consent into their own tenant, which creates a service principal for our app there. We prefer delegated permissions (acting as the signed-in user) and use application permissions (acting without a user, often requiring admin consent) only where truly required, so the whole product is never gated on the most sensitive permission. Deeper scope is requested incrementally, when a user enables the feature that needs it, not at signup.

## Consequences

- Onboarding is never gated on Microsoft admin consent, which is what makes the product sellable to owner-led shops without dedicated IT (ADR-016). The product degrades gracefully rather than failing closed.
- Live workbook access for the Excel round-trip depends on Level 3 (ADR-004), while manual upload remains available at Level 0 for clients who cannot get consent.
- Publisher verification and the least-privilege Graph permission inventory become items on the registration roadmap and in the security packet (ADR-015). Publisher verification is free but requires a real company, a real publisher domain (not an onmicrosoft.com domain), and a Microsoft partner account. Microsoft 365 Publisher Attestation is a free self-assessment; Microsoft 365 Certification is deeper, currently free, and its evidence review averages on the order of sixty days, so it is deferred until strategically useful.

## Alternatives considered

**Require Microsoft Graph for the whole app.** Simplest integration story. Rejected because it blocks exactly the small clients that are the early market the moment admin consent stalls, which the friction list says is common.

**One global "integrate with Microsoft" toggle.** A single switch that grants everything at once. Rejected because it requests too many permissions, frightens buyers, and is the opposite of the incremental, feature-scoped consent pattern that is both standard and least-privilege.

**Per-customer app registration as the default.** Have each client create their own Entra app registration. Rejected as default onboarding because it pushes heavy IT work onto small clients that cannot do it. It belongs to a later managed or self-host tier for clients who want their own registration.

## Open items

1. **First Microsoft feature beyond login.** Which level to build first: the file picker (Level 2), Excel sync (Level 3), or Outlook (Level 4). The file picker is the lowest-friction way to test the Microsoft data path.
2. **Publisher verification timing.** Whether verification is needed before the first external pilot, given the unverified-publisher friction, and where attestation and certification sit on the roadmap (ADR-015).
3. **Deployment-mode support.** Whether the product offers app-owned registration only, or also a customer-owned registration mode for higher-trust clients.
