# Security, Compliance, And Vendor Risk: Research Note

Status: research/application note
Date reviewed: June 5, 2026

## Why This Topic Matters

This project will handle relationship, deal, contact, message, and possibly financial-adjacent data. The early prototype does not need to be overdesigned like a bank vendor platform, but the architecture should be credible enough for real business data and should not block future SOC 2/vendor-risk readiness.

The key question is not only "which certifications do we need?" It is:

> What trust posture must exist before small organizations, financial-adjacent firms, or eventually regulated clients will allow the product to process their CRM data?

## Direct Relevance Rating

10/10.

This is one of the highest-impact design topics because security and auditability affect data model, auth, SMS behavior, Microsoft permissions, agent writes, customer onboarding, pricing, and future market selection.

## Source Takeaways

### SOC 2

SOC reports are issued for service organizations. SOC 2 focuses on controls relevant to security, availability, processing integrity, confidentiality, and privacy, using AICPA Trust Services Criteria.

Project implication:

- SOC 2 is not a v1 prototype prerequisite.
- SOC 2 readiness should influence the architecture from the beginning.
- Controls that will matter later include access control, change management, incident response, vendor management, logging, backups, and data handling.

### ISO/IEC 27001

ISO/IEC 27001 is an international information-security management-system standard. It focuses on managing security risk through a formal ISMS, policies, controls, monitoring, and continuous improvement.

Project implication:

- ISO 27001 is more likely to matter for enterprise/international procurement.
- US SaaS buyers commonly ask for SOC 2 first, especially for early B2B SaaS.
- The controls overlap conceptually: both push the product toward documented risk management and repeatable security processes.

### FTC Safeguards Rule

The FTC Safeguards Rule applies to covered financial institutions and requires safeguards for customer information, including oversight of service providers.

Project implication:

- If the product targets regulated financial institutions or handles protected customer financial information, vendor-risk expectations rise sharply.
- "Financial-adjacent" real estate/deal shops are different from banks, broker-dealers, RIAs, or lenders handling regulated consumer financial information.
- The product should avoid regulated financial-institution scope for the first market unless there is a clear compliance plan.

### FINRA Cybersecurity / Vendor Risk

FINRA guidance emphasizes cybersecurity, third-party/vendor risk, access management, incident response, data protection, and governance for broker-dealers.

Project implication:

- Broker-dealers and similar regulated firms should not be the first target market.
- If the product later enters that market, expect security questionnaires, vendor due diligence, stronger controls, and documented policies.

## Project Translation

### Private Prototype Trust Packet

Before a private pilot with real data, prepare:

- Privacy policy.
- Terms.
- DPA template.
- Subprocessor list.
- Data-flow diagram.
- Security architecture diagram.
- Access-control/RBAC model.
- Supabase RLS policy inventory.
- Audit-log design.
- Backup/restore plan.
- Incident response policy.
- AI data handling statement.
- Microsoft Graph permission inventory if Microsoft connector is enabled.
- SMS compliance plan if SMS is enabled.

### Product Controls To Design In Early

- Workspace/tenant isolation.
- Role-based access control.
- Row-level security.
- Server-side secrets.
- Approval-gated agent writes.
- Append-only audit events.
- Weekly chronological change reports.
- Source-message preservation.
- Schema-contract versioning.
- Integration sync logs.
- Admin/config change logs.

### Certification Path

Recommended staged posture:

1. Private prototype: security packet and baseline controls.
2. External beta: stronger documentation, Microsoft publisher verification, security questionnaire packet.
3. Early SaaS sales: SOC 2 readiness program.
4. Larger buyers: SOC 2 Type I or Type II depending buyer pressure.
5. Enterprise/international: consider ISO 27001 if the market demands it.

## Market Implications

Best early market:

- Microsoft-heavy SMBs.
- Real estate acquisition/development.
- Private lenders and brokers that are not regulated like banks/broker-dealers.
- Family offices and boutique deal shops.
- Professional-services BD teams.

Avoid as first market:

- Banks.
- Broker-dealers.
- RIAs handling regulated client records.
- Public-company compliance environments.
- Healthcare/insurance.

## V1 Recommendation

V1 does not need SOC 2 or ISO certification, but it should be built as if future SOC 2 readiness will matter.

The security posture should be productized as:

> The system preserves source messages, approval decisions, schema changes, sync events, and agent-written updates in an auditable timeline.

That posture is not just compliance. It is also core user trust.

## Open Questions

- What client data will be stored in v1: contacts only, deal terms, financing details, documents, or consumer/customer financial information?
- Will any regulated financial institution use the prototype?
- Who owns legal documents: the founders or external counsel?
- How long should SMS/email source messages be retained?
- What level of audit detail should appear in weekly reports versus admin-only logs?

## Sources

- AICPA/CIMA, System and Organization Controls overview: https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2
- AICPA/CIMA, Trust Services Criteria: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022
- ISO, ISO/IEC 27001 overview: https://www.iso.org/standard/27001
- FTC, Safeguards Rule guidance: https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know
- FINRA, Cybersecurity topic page: https://www.finra.org/industry/cybersecurity

