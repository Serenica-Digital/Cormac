# Compliance and Platform Registration Research

Research date: June 5, 2026

This memo supports the AI-native CRM platform PRD. It focuses on requirements that affect architecture, sales readiness, and implementation sequencing.

## Executive Takeaways

1. Microsoft integration is feasible, but customer tenant consent will be a real adoption step. Expect admin review for broad Graph permissions, especially mail, files, SharePoint, and application-level access.
2. Microsoft publisher verification should be treated as an early trust requirement for any multi-tenant Microsoft 365 app. Microsoft says there is no charge and, if prerequisites are met, verification can be completed quickly.
3. Microsoft 365 Publisher Attestation is a useful next trust milestone. It is a self-assessment for Microsoft 365 apps/SaaS apps and can often be completed quickly, but the developer remains responsible for accuracy.
4. Microsoft 365 Certification is more involved, currently free according to Microsoft, and typically averages around 60 days from full evidence review. It is not the same as SOC 2, and SOC 2 is not required to apply.
5. SOC 2 should be designed for from day one, but not promised for the private pilot. A realistic path is security baseline -> policies/evidence -> SOC 2 Type I when customer pressure justifies it -> Type II after an observation period.
6. SMS is not just a Twilio API task. US business texting through Twilio 10DLC requires A2P registration, campaign/use-case details, consent/opt-out language, carrier fees, and potentially uncertain approval timelines.
7. A Claude connector is now a viable product interface through remote MCP, but it should be an interface over the product's safe tools, not the primary system of record or approval engine.

## Microsoft App Registration and Consent

If the product integrates with Microsoft 365, it will likely need a multi-tenant Microsoft Entra app registration. The exact permission set depends on the chosen v1 integration surface.

Relevant Graph permission examples:

- Excel/OneDrive/SharePoint file access may require delegated `Files.ReadWrite`, delegated/application `Files.ReadWrite.All`, `Sites.Read.All`, or `Sites.ReadWrite.All`, depending on scope.
- Outlook ingestion may require `Mail.Read`, `Mail.ReadBasic`, or `Mail.ReadWrite`.
- Sending mail requires separate send permissions; mail read/write permissions do not imply send.
- Application permissions commonly require admin consent.

Microsoft emphasizes least-privilege permission requests. Broad permissions can reduce customer trust and trigger admin review.

Architecture implication:

Prefer delegated permissions and narrow scopes first. Avoid "read/write all files in all site collections" as a default v1 permission unless the integration truly needs it.

Sources:
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Configure how users consent to applications](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
- [Application consent management and evaluation of consent requests](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-consent-requests)

## Microsoft Publisher Verification

Publisher verification gives Microsoft Entra users/admins a verified publisher signal on consent prompts. Microsoft says:

- The app must be registered in a Microsoft Entra tenant.
- The app must have a publisher domain set.
- The publisher domain cannot be an `*.onmicrosoft.com` domain.
- The publisher needs a Microsoft AI Cloud Partner Program account.
- The initiating user needs appropriate roles in Entra and Partner Center.
- MFA is required.
- Microsoft says there are no charges for publisher verification and no license is required.

Architecture/business implication:

Set up a real company/domain/tenant identity early if this becomes a SaaS product. Using a throwaway tenant/domain will create avoidable friction later.

Source:
- [Microsoft publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- [Mark an app as publisher verified](https://learn.microsoft.com/en-us/entra/identity-platform/mark-app-as-publisher-verified)

## Microsoft 365 App Compliance Program

For a Microsoft-integrated SaaS, Microsoft provides a trust ladder:

- Publisher Attestation: self-assessment of security, data handling, compliance, and legal practices.
- Microsoft 365 Certification: deeper review of app security and data-handling controls.
- ACAT: Azure tool for monitoring and accelerating app compliance evidence.

Publisher Attestation:

- Available for Microsoft 365 add-ins, apps, agents, and SaaS web apps.
- Covers data handling, security, compliance, and legal attributes.
- Microsoft says most attestations can be completed in one hour or less depending on app framework.
- Microsoft does not independently verify the submitted information.
- Approved attestations last one year and must be renewed.

Microsoft 365 Certification:

- SOC 2/ISO/PCI are not required to apply, though they may support evidence.
- Microsoft says full evidence review averages around 60 days, depending on variables.
- Microsoft says certification is currently free.
- Microsoft says penetration testing is free for up to 12 days and 2 retest days under the program, with possible charges beyond that.

Product implication:

For early pilots, prepare the same documents that would eventually support Publisher Attestation and certification: data-flow diagrams, privacy policy, retention policy, subprocessor list, architecture inventory, access controls, incident response, vulnerability management, and evidence screenshots.

Sources:
- [Microsoft 365 App Compliance Program](https://learn.microsoft.com/en-us/microsoft-365-app-certification/)
- [Publisher Attestation overview](https://learn.microsoft.com/en-gb/microsoft-365-app-certification/docs/attestation)
- [Microsoft 365 Certification framework overview](https://learn.microsoft.com/en-us/microsoft-365-app-certification/docs/certification)
- [Microsoft 365 Certification FAQ](https://learn.microsoft.com/en-us/microsoft-365-app-certification/docs/certfaq)

## Excel / OneDrive / SharePoint Integration

Microsoft Graph can read and modify Excel workbooks stored in OneDrive for Business, SharePoint sites, or Group drives. Graph exposes workbook objects such as tables and ranges through REST APIs.

However, Microsoft's Excel API docs also expose real operational risk:

- The Excel REST API supports Office Open XML workbooks.
- Workbook/session behavior matters.
- Workbooks can fail API sessions when they contain unsupported features or exceed limits.

Architecture implication:

The safest v1 Excel path is controlled:

1. App owns the canonical CRM data.
2. Export/import uses a controlled workbook template or Excel table.
3. If sync is included, sync only named tables with stable IDs/columns.
4. Treat arbitrary existing workbooks as a later capability.

Sources:
- [Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel?view=graph-rest-1.0)
- [Error handling for Excel APIs](https://learn.microsoft.com/en-us/graph/workbook-error-handling)

## SMS / Twilio A2P 10DLC

For US business texting through Twilio long-code numbers, carriers treat Twilio traffic as A2P 10DLC. Registration and fees are part of the channel, not optional polish.

Current Twilio details found:

- A2P 10DLC applies to US business messaging over 10-digit long codes.
- Registration includes brand and campaign/use-case registration.
- Twilio says registration timeline is not exact because approval involves carriers, Twilio, and external vetting partners.
- Twilio updated some A2P fees effective August 1, 2025:
  - Sole Proprietor Brand registration: $4.50 one-time.
  - Standard vetting: $41.50 per vetting.
  - Vetting appeal: $11.00.
  - Authentication Plus: $12.50 per retry for eligible public, for-profit brands.
- Carrier per-message fees are charged in addition to Twilio's standard messaging pricing.

Product implication:

SMS in v1 should be scoped explicitly. "Text the CRM" requires:

- Twilio number and messaging service.
- A2P registration.
- Consent capture and opt-out language.
- Sender/user identity mapping.
- Webhook receiver.
- Abuse handling.
- Message log/audit linkage.
- Approval-gated writes.

Sources:
- [Twilio: What is A2P 10DLC?](https://help.twilio.com/articles/1260800720410-What-is-A2P-10DLC)
- [Twilio: A2P 10DLC pricing and fees](https://help.twilio.com/hc/en-us/articles/1260803965530-A2P-10DLC-Campaign-Registration-Guide)
- [Twilio: 10DLC overview](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)
- [Twilio: Programmable Messaging and A2P 10DLC](https://www.twilio.com/docs/sms/a2p-10dlc)

## SOC 2 Path

SOC 2 is a trust framework and audit report for service organizations. For this product, it is probably not required before a private design-partner pilot, but the product should be built in a SOC 2-ready way from the start.

Practical interpretation:

- Type I evaluates control design at a point in time.
- Type II evaluates whether controls operate effectively over an observation period.
- Compliance automation tools can reduce evidence-collection burden, but they do not replace secure architecture or an auditor.
- Early customers may accept a security packet plus SOC 2 roadmap; larger organizations may require Type I or Type II before production use.

Recommended staged posture:

1. Pilot posture: security baseline, DPA, privacy policy, data retention policy, subprocessor list, RBAC, audit logs, backups, incident response, and least-privilege integrations.
2. Sales-readiness posture: complete SOC 2 readiness checklist and evidence collection.
3. First audit posture: SOC 2 Type I when enterprise sales pressure appears.
4. Mature posture: SOC 2 Type II after a sustained control observation period.

Sources:
- [Vanta SOC 2 audit timeline](https://www.vanta.com/collection/soc-2/soc-2-audit-timeline)
- [Vanta audit FAQ](https://help.vanta.com/en/articles/11345826-frequently-asked-questions-audits)
- [Drata SOC 2 Type 2 overview](https://drata.com/learn/soc-2/type-2-overview)

## Claude Connector / Remote MCP

Claude custom connectors using remote MCP are now a realistic integration surface. Anthropic documentation says custom connectors using remote MCP are available across Claude surfaces, and that Claude connects to a remote MCP server from Anthropic's cloud infrastructure.

Product implication:

Build the product's own API and approval engine first. Then expose safe MCP tools:

- Read CRM records.
- Search deals/people/organizations.
- Create proposed updates.
- Fetch pending tasks/follow-ups.
- Prepare call briefs.

Avoid direct autonomous write tools in the first connector. MCP should route mutation through the same proposal/approval flow used by the web app.

Sources:
- [Claude Help: custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-about-custom-connectors)
- [Claude connector authentication docs](https://claude.com/docs/connectors/building/authentication)
- [Claude connectors overview](https://claude.com/docs/connectors/overview)

## Recommended V1 Compliance/Registration Checklist

Before private pilot:

- Company domain and Microsoft tenant chosen.
- Privacy policy and terms drafted.
- DPA template drafted.
- Subprocessor list drafted.
- Data-flow diagram drafted.
- Security architecture diagram drafted.
- Tenant isolation model documented.
- RBAC model implemented.
- Audit log implemented.
- Backup/restore plan documented and tested.
- Incident response policy drafted.
- Secrets management documented.
- Microsoft Graph permissions minimized and documented.
- AI data handling documented, including model vendors and retention settings.

Before Microsoft-heavy external beta:

- Microsoft publisher verification.
- Microsoft Publisher Attestation.
- Admin consent onboarding guide.
- Security questionnaire packet.
- A2P registration if SMS is enabled.

Before broader SaaS sales:

- SOC 2 readiness program.
- SOC 2 Type I if buyer pressure requires it.
- Microsoft 365 Certification if Microsoft marketplace/admin trust becomes strategically important.
- SOC 2 Type II once controls have operated over the required observation period.

