# Supabase Production Security Checklist

Status: planning checklist
Last updated: June 5, 2026

Purpose: define what "Supabase is acceptable for professional SaaS" means in implementation terms for the AI-native CRM platform.

## Position

Supabase/Postgres is the recommended v1 operational data foundation. It is acceptable for a professional SaaS if the product is built with strong tenant isolation, row-level security, server-side business logic, auditability, backups, and documentation.

The main risk is not Supabase itself. The risk is using Lovable or other rapid app-generation tools to create a Supabase app with weak RLS, overexposed tables, leaked service keys, or important business logic living only in the browser.

## Platform Choice

Recommended:

- Supabase/Postgres for canonical operational data.
- Supabase Auth for initial auth unless Microsoft SSO is required immediately.
- Supabase Edge Functions or separate backend worker for integrations and agent operations.
- GitHub source control from the beginning.

Not recommended:

- Client-side service role keys.
- Direct browser writes to sensitive tables without RLS.
- Relying only on Lovable-generated frontend logic for authorization, validation, approval, or auditing.
- Treating generated code as production secure without review.

## Required Before Private Pilot

### Tenant Isolation

- Every business table includes `workspace_id` or equivalent tenant boundary.
- RLS is enabled on all exposed tables.
- RLS policies restrict users to authorized workspaces.
- Cross-tenant access tests exist for important read/write flows.
- Admin/service operations are server-side only.

### Keys and Secrets

- Supabase `service_role` key is never present in frontend code.
- API keys and provider secrets are stored in environment/secrets management.
- Twilio, Microsoft Graph, and LLM credentials are server-side only.
- Local/dev credentials are separate from production credentials.

### Database Access

- Exposed tables use least-privilege grants.
- Sensitive mutations go through RPC/server functions or backend API.
- Approval/apply proposal logic is server-side.
- Audit-event creation cannot be skipped by normal client flows.
- Schema-contract changes require privileged role and audit logging.

### Row-Level Security

- RLS enabled for workspaces, users, memberships, records, record values, source messages, agent proposals, audit events, agent settings, sync state, and integration settings.
- Policies cover `select`, `insert`, `update`, and `delete` separately.
- Delete permissions are restricted or replaced with archive/status behavior.
- Read-only role cannot mutate records or approve proposals.
- Agent Admin role is required for agent/schema settings.

### Audit Logging

- Every approved agent proposal creates audit events.
- Manual edits create audit events.
- Schema-contract changes create audit events.
- Integration sync jobs create audit/sync-run records.
- Admin/user/role changes create audit events.
- Audit logs are append-only through normal app flows.

### Agent and Integration Safety

- LLM calls happen server-side.
- Agent responses are parsed and validated before becoming proposals.
- Agent-created writes require approval by default.
- Microsoft Graph calls happen server-side.
- Twilio webhooks validate sender identity and log source messages.
- Excel import/sync jobs validate schema contracts before applying changes.

### Backups and Recovery

- Production database backups are enabled.
- Restore process is documented.
- Basic recovery drill is planned before broader beta.
- Critical sync/import jobs are idempotent or recoverable.

### Logging and Monitoring

- Server-side integration jobs log failures.
- Failed agent proposals are inspectable.
- Sync failures produce visible admin errors.
- Security-relevant errors are logged.
- Monitoring/alerting plan exists before broader beta.

### Documentation

- Data-flow diagram.
- Security architecture diagram.
- Supabase RLS/policy inventory.
- Subprocessor list.
- DPA/privacy/terms drafts.
- AI data handling statement.
- Microsoft Graph permission inventory if Microsoft integrations are enabled.
- SMS/A2P compliance notes if SMS is enabled.

## Strongly Recommended Before External Beta

- Supabase Team or Enterprise plan if audit logs/SOC 2 report access are needed.
- Microsoft publisher verification if Microsoft integrations are central.
- SSO strategy, likely Microsoft Entra for Microsoft-heavy customers.
- Security questionnaire packet.
- Basic penetration/security review of generated frontend and Supabase policies.
- Staging environment separate from production.
- Migration workflow using checked-in SQL migrations.
- Automated checks for RLS enabled on exposed tables.
- Automated check that service keys are not committed or shipped client-side.

## Architecture Rule

Lovable may generate UI and simple data flows, but the system's trust boundaries must live below the UI:

- Database constraints.
- RLS policies.
- Server functions.
- Backend workers.
- Append-only audit tables.
- Explicit approval/apply procedures.

If a user can bypass a rule by editing frontend code or calling Supabase directly with an anon key, the rule is not real.

## Sources

- [Supabase Security](https://supabase.com/docs/guides/security)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase platform audit logs](https://supabase.com/docs/guides/security/platform-audit-logs)
- [Firebase Privacy and Security](https://firebase.google.com/support/privacy)
- [Cloud Firestore data model](https://firebase.google.com/docs/firestore/data-model)

