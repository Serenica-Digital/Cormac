# Security Questionnaire (reusable answers)

Status: drafted (reusable template)
Maps to: the whole packet
Last reviewed: 2026-06-06

Pre-written answers to the questions a client's IT or vendor-risk reviewer typically asks. Each points to the packet doc with the detail and proof. Keep answers honest: where a control is pending, say so.

**How is one client's data kept separate from another's?**
Every tenant row carries a workspace id, and row-level security enforces that a user can only reach their own workspace's rows, independent of application logic. Authorization is also enforced in the control plane. Proven by an automated cross-tenant test. See [tenant-isolation.md](tenant-isolation.md).

**Can the AI change our data on its own?**
No. The AI proposes; it holds no database credentials and cannot write. Every proposal is validated against your contract and either held for approval or applied-and-reported per your setting, and every change is audited. See [agent-runtime-security.md](agent-runtime-security.md).

**What data is sent to the AI model?**
The user's message, your contract's field definitions (schema, not data), and a minimized set of record fields for matching. Fields you mark sensitive are never sent to the model. See [ai-data-handling.md](ai-data-handling.md) and [data-flow.md](data-flow.md).

**How do you authenticate users and control access?**
Login via your identity provider, a verified session token on every protected request, and role-based permissions enforced server-side. See [auth-rbac.md](auth-rbac.md).

**Is there an audit trail?**
Yes, append-only, with before/after values and a link to the message that caused each change. It cannot be altered or deleted. See [audit-logging.md](audit-logging.md).

**Who are your subprocessors?**
Listed, with what each sees and its DPA, in [subprocessors.md](subprocessors.md). The list depends on which features you enable.

**How are secrets handled?**
Server-side only, never in the browser or in the AI runtime, never in source. See [secrets-management.md](secrets-management.md).

**What about backups and incident response?**
Backups are managed by the database provider with a documented restore path (drill pending); incident response follows a defined severity and notification process. See [backup-restore.md](backup-restore.md) and [incident-response.md](incident-response.md).

**Are you SOC 2 certified?**
Not yet. The architecture is designed for it and baseline controls are implemented; certification is staged behind buyer demand (ADR-015). For a private pilot the bar is this packet plus enforced baseline controls.

**Do you support SSO / Microsoft / SMS?**
Optionally and tiered. The base product needs no Microsoft permissions; Microsoft and SMS are least-privilege, consent-gated additions. See [microsoft-permissions.md](microsoft-permissions.md) and [sms-compliance.md](sms-compliance.md).
