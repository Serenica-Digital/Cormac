# Architecture and Trust Boundaries

Status: drafted
Maps to: control-register rows 1-5, 7-10
Last reviewed: 2026-06-06

The trust topology. The canonical diagram lives in [../prd/architecture.md](../prd/architecture.md); this doc states the boundaries in security terms.

## The boundaries

| Zone | Trust | What it may do |
| --- | --- | --- |
| Surfaces (web, SMS, email, Excel, Claude/MCP) | Untrusted | Submit input; never write business data |
| Inbound connectors (Twilio, email, Graph webhooks) | Provider-verified at ingress | Create a source message after provider auth; never write business data |
| Control plane (`apps/api`) | Trusted authority | Verify identity, enforce RBAC, validate against the contract, write, audit. The only writer. |
| Agent runtime (Hermes; stub today) | Untrusted output, no credentials | Read the context it is handed, return a structured proposal. No DB access. |
| Database (Supabase/Postgres) | System of record | Enforce RLS as a backstop; hold the append-only audit |

## The one invariant

The control plane is the only writer. Surfaces and the runtime never mutate business records directly, and the runtime holds no database write credentials. This is enforced three ways at once: there are no RLS write policies for users ([0002_rls.sql](../../supabase/migrations/0002_rls.sql)), the service-role key is server-only ([app.ts](../../apps/api/src/app.ts)), and the runtime workload surfaces no Supabase env ([hermes-runtime chart](../../deploy/helm/hermes-runtime/values.yaml)).

## How a write happens

A message enters a surface, the control plane verifies the caller and creates a source message, hands tenant-scoped context to the runtime, validates the returned proposal against the active contract, holds it for approval (confirm-each), and on approval writes the record and an audit event. Detail in [data-flow.md](data-flow.md) and [audit-logging.md](audit-logging.md).

## Defense in depth

Authorization is decided in the control plane (JWT + workspace role + capability). RLS is a second line that holds even if application logic is wrong: a user's own database token can only ever reach their workspace's rows. The two are independent, so a bug in one does not open the other.
