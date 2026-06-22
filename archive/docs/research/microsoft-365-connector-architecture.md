# Microsoft 365 Connector Architecture: Research Note

Status: research/application note
Date reviewed: June 5, 2026

## Why This Topic Matters

The product is aimed at customers who live in Outlook, Excel, OneDrive, and SharePoint. The product should integrate with Microsoft 365 without requiring the entire app to run inside Microsoft or requiring every small customer to complete a heavy IT onboarding process before the product works.

The core pattern is:

> Hosted SaaS with optional Microsoft 365 connector levels.

## Direct Relevance Rating

10/10.

Microsoft integration strategy directly affects onboarding friction, security posture, market selection, v1 scope, and whether small businesses can use the product without dedicated IT support.

## Source Takeaways

### Multi-Tenant SaaS App Pattern

Microsoft supports single-tenant and multi-tenant app registrations. A SaaS product commonly registers a multi-tenant app in the vendor's Microsoft Entra tenant. Customers then consent to that app in their own tenants, creating a service principal for the app in the customer tenant.

Project implication:

- The product should not require each small customer to create their own Microsoft app registration for normal SaaS use.
- The product team owns the Microsoft app registration.
- Customer onboarding is consent-based, not "go build an app registration yourself."

### Delegated Versus Application Permissions

Microsoft Graph permissions may be delegated, acting as a signed-in user, or application-level, acting without a signed-in user. Application permissions are more powerful and often require admin consent.

Project implication:

- Use delegated permissions first wherever practical.
- Avoid broad application permissions in v1 unless truly required.
- Separate connector features by permission level so the whole product is not blocked by the most sensitive permission.

### Admin Consent And Incremental Consent

Microsoft supports admin consent and user consent flows. Admin consent may be required based on tenant policy or permission sensitivity. Microsoft also supports incremental/dynamic consent patterns so apps request permissions as features need them.

Project implication:

- Do not ask for every Microsoft permission at signup.
- Ask for permissions when the user enables a connector feature.
- Provide plain-language admin consent documentation.
- Expect small customers to need help finding their Microsoft admin or MSP.

### File Picker And Selected Resource Patterns

Microsoft offers file picker patterns for selecting OneDrive/SharePoint files. Using selected resources or user-driven selection can reduce friction compared with requesting broad tenant-wide access.

Project implication:

- Prefer "select an Excel workbook" over "grant access to every SharePoint file."
- Prefer manual upload or picker flows before always-on tenant-wide sync.

## Recommended Connector Levels

### Level 0: No Microsoft Connection

Works with:

- SMS.
- Web/PWA.
- Supabase CRM.
- Manual Excel upload/import.
- Manual document links.

Why:

The product must work even when Microsoft admin consent is delayed.

### Level 1: Microsoft Login

Capabilities:

- Sign in with Microsoft.
- Basic user profile.

Why:

Low-friction identity improvement, but not the same as deep Graph access.

### Level 2: Select Excel Workbook / File

Capabilities:

- User selects a workbook from OneDrive/SharePoint.
- App imports or reads selected table data.

Why:

This tests the Microsoft data workflow with less trust friction than broad SharePoint access.

### Level 3: Controlled Excel Table Sync

Capabilities:

- Read/write selected workbook/table.
- Store sync state.
- Detect conflicts.

Why:

This is the first "real Microsoft sync" milestone and should be feature-scoped.

### Level 4: Outlook / Email Integration

Capabilities:

- Forwarded mailbox ingestion.
- User mailbox connection.
- Possibly sent-message or thread metadata.

Why:

Email is valuable but privacy-sensitive. Full mailbox access should not be bundled into basic onboarding.

### Level 5: Admin-Approved Organization Connector

Capabilities:

- Tenant-admin consent.
- Broader SharePoint/Outlook/Excel access.
- More automation.

Why:

This is powerful but procurement-sensitive. It belongs after the core product has proven value.

## Product Design Pattern

The app should include an integration settings screen like:

```text
Settings > Integrations > Microsoft 365

[ ] Sign in with Microsoft
[ ] Select Excel workbook
[ ] Enable workbook sync
[ ] Connect Outlook mailbox
[ ] Connect SharePoint documents
```

Each setting should explain:

- What it enables.
- What permission it requests.
- Whether admin consent may be required.
- What data is read/written.
- How to disconnect.

## V1 Recommendation

Do not make Microsoft Graph mandatory for the base app.

V1 should work with:

- SMS.
- Web/PWA.
- Supabase.
- Manual Excel upload/import.
- Optional Microsoft login or file selection.

Deeper connector scope should be feature-gated:

- Excel sync only when selected.
- Outlook access only when selected.
- Broad tenant/admin permissions only when necessary.

## Market Implications

Small Microsoft-heavy clients often have a Microsoft tenant without knowing it. The friction is usually:

- Nobody knows who the Microsoft admin is.
- An MSP controls the tenant.
- User consent is disabled.
- Admin consent is required.
- The app is not publisher verified.
- The customer uses consumer Microsoft accounts rather than Microsoft 365 Business accounts.

The product should expect this and degrade gracefully:

> Works standalone. Gets better when Microsoft is connected. Gets powerful when admin-approved.

## Open Questions

- Is Microsoft login required in v1, or is Supabase Auth enough initially?
- Which Microsoft feature should be first: file picker, Excel sync, Outlook, SharePoint links, or login?
- Do we need Microsoft publisher verification before the first external pilot?
- Do customers need app-owned Microsoft registration, customer-owned registration, or both deployment modes?

## Sources

- Microsoft, Single-tenant and multi-tenant apps: https://learn.microsoft.com/en-us/entra/identity-platform/single-and-multi-tenant-apps
- Microsoft, Graph permissions overview: https://learn.microsoft.com/en-us/graph/permissions-overview
- Microsoft, Permissions reference: https://learn.microsoft.com/en-us/graph/permissions-reference
- Microsoft, Consent types and incremental consent: https://learn.microsoft.com/en-us/entra/identity-platform/consent-types-developer
- Microsoft, Admin consent workflow: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/admin-consent-workflow-overview
- Microsoft, OneDrive file picker: https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/js-v72/
- Microsoft, Working with Excel in Microsoft Graph: https://learn.microsoft.com/en-us/graph/api/resources/excel

