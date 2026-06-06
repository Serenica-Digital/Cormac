# ADR-014: Lovable for the web UI only; trust enforced server-side

**Status:** Accepted (Lovable for the UI shell); whether it builds the generic contract-driven UI runtime is an open pressure-test
**Date:** 2026-06-06
**Related:** Builds the internal doors of ADR-007 on top of ADR-003 (Supabase), with all writes routed through ADR-005 (the control plane is the only writer). The generic-UI burden it carries is the central risk named in ADR-001 and ADR-002, the server-side enforcement is evidence for ADR-015 (security), and the containerized services it produces run on the orchestration platform of ADR-017.

## Context

The original plan leaned on Lovable plus Supabase connectors to build most of the app, partly because Supabase ships connectors for Twilio, Microsoft, and more, and Lovable understands Supabase Auth and RLS natively. Two things complicate that plan, and the ADR has to hold both honestly.

First, the trust-critical logic cannot live in generated frontend code. The distinction that matters is authorship versus enforcement: Lovable may author code and config, including Supabase schema, RLS policies, RBAC flows, and auth screens, but authority has to be enforced where it cannot be bypassed by calling the API directly. "The UI hides the button" is not a control.

Second, and more uncomfortable, a contract-first product needs a generic, metadata-driven UI generated from each client's contract (ADR-002), which is a different thing from the bespoke React screens Lovable is strongest at. The PRD-era assumption that "Lovable accelerates the UI" is shakiest exactly where the work is hardest.

## Decision

Lovable builds the web UI. The control plane owns all trust-critical logic server-side. The two are split by authorship versus enforcement, not by feature.

### 1. Where each layer lives

| Operation | Lovable / Supabase direct | Control plane |
| --- | --- | --- |
| Login and session | Supabase Auth | Verifies the JWT (ADR-011) |
| Show current records, proposal queue | Yes, under RLS | |
| Approve or apply a proposal | | Yes |
| Upload a workbook for contract inference | | Yes |
| Twilio webhook, Microsoft Graph sync, email ingestion | | Yes |
| Agent or runtime call | | Yes |
| Audit event creation | | Yes |
| Admin settings that change agent behavior or the contract | | Yes |

Good for Lovable: login, the workspace shell, the contract review wizard UI, generic record table, detail, and relationship views, the proposal review queue, audit views, settings, and integration screens. Kept server-side: RBAC, RLS design, audit enforcement, approval and apply logic, secrets, webhook handling, Graph and Twilio and model calls, and runtime orchestration. These stay safe even if the API is called directly.

### 2. Two access levels

The web app uses the Supabase anon key for login and RLS-limited reads, and calls the control-plane API with the user's bearer JWT for everything dangerous. The service role key never touches frontend code. The anon key is safe to ship in the browser only because RLS enforces what a user can reach; the service role key bypasses RLS and is server-only (ADR-003).

### 3. Monorepo, not a submodule

`apps/web` is a normal package in the pnpm monorepo alongside the control-plane API, the worker, the shared contract and Zod packages, and the Supabase migrations. They are versioned together, so a shared schema change updates the UI and the API in one commit. Lovable is the editor and generator for `apps/web`, not the owner of a separate repository. A submodule was considered and rejected because it makes shared-type co-evolution and refactoring harder for no benefit before the web app is independently deployed or team-owned.

## Consequences

- The trust boundary lives below the UI, which is what makes a generated frontend safe to use at all, and it is the concrete reason the security packet can claim enforced controls rather than UI-level ones (ADR-015).
- Lovable builds the UI, not the deployment. The real application is a monorepo of containerized services (web, API, worker, runtime) that run on the preferred orchestration platform (ADR-017). Lovable produces `apps/web`; it does not own where or how the app runs.
- The honest risk: the contract-first UI is where this stack is most likely to strain. Lovable excels at bespoke screens and is not obviously strong at a generic, schema-driven UI runtime that renders table, detail, relationship, and form views from a contract. That generic runtime is the hardest UI work in the product and the ADR-001 and ADR-002 central risk made concrete. This is a pressure-test item, not a settled assumption.

## Alternatives considered

**Build the whole app in Lovable, including connectors and business logic.** Fast to start. Rejected because it gets confusing and unsafe the moment tenant-aware backend APIs, the proposal and audit pipeline, Graph and Twilio token handling, runtime orchestration, and cross-tenant isolation tests are needed. Those belong in owned, tested server code, not generated frontend or low-code connectors.

**Let Lovable and Supabase connectors be the canonical backend.** Use the platform connectors for Twilio, Microsoft, and writes. Rejected because it puts trust-critical behavior in generated and connector-driven code rather than in the control plane that owns authorization and audit (ADR-005). The connectors are fine for prototyping, not for the trusted path.

**A git submodule for the web app.** Rejected for the co-evolution and refactoring friction above.

## Open items

1. **Is Lovable the right tool for the generic UI runtime.** Whether the contract-driven table, detail, relationship, and form rendering is built in Lovable or hand-built, decided after a real pressure test rather than assumed. This is the open question most likely to change the stack.
2. **Export and ownership boundary.** How Lovable-generated code is brought into `apps/web` and kept editable both by Lovable and by hand without the two fighting.
