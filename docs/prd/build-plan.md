# Build Plan

> **Status:** canonical · **Last reviewed:** 2026-06-06

Companion to [architecture.md](architecture.md) and [contract-model.md](contract-model.md). Those two describe *what* we are building (the trust topology and the data-and-contract view). This one describes *how and in what order* we build it. The why for every choice lives in the ADRs; this doc only records the sequence and points back.

The governing idea: do not start with features. Stand up a thin foundation with the trust boundary real from the first row, then drive one **walking skeleton**, a single message going all the way through *capture -> propose -> validate -> confirm -> write -> audit*. That one thread doubles as the Hermes-seam spike (ADR-006) and the Juno-deploy spike (ADR-017), so proving it de-risks the three shakiest assumptions (the runtime seam, container deploy, JSONB storage) with nothing thrown away. Every surface and feature after that bolts onto a spine that already works.

## Phase 0: Foundation, with the trust boundary real from row zero

The point of Phase 0 is that the invariants in [CLAUDE.md](../../CLAUDE.md) are physical, not aspirational, before any business data exists.

- **Repo and monorepo.** `git init`, then a pnpm workspace: `apps/web`, `apps/api` (the control plane), `apps/worker`, and shared `packages/contract`, `packages/db`, `packages/shared`. Supabase migrations are versioned in the same repo (ADR-014).
- **Schema and RLS.** App-owned operational tables only. Contract-defined business objects are data, never tables (ADR-002). Every tenant row carries a `workspace_id`; every tenant table has an RLS policy; `audit_events` is append-only with before/after values and a source link (ADR-003, ADR-005, ADR-015).
- **Records storage.** `business_records` is JSONB-first with generated/indexed columns for the hot fields, validated against the active contract before insert. This is the hybrid leaning of ADR-002/003, and building it here folds the storage question into real work instead of a throwaway spike.
- **Control plane.** A Node/TypeScript (Fastify) API that verifies the Supabase JWT, loads workspace and role, and enforces RBAC before any runtime call or write (ADR-011). It owns the one command/proposal pipeline every surface routes through (ADR-007). It holds the service role key server-side only; the runtime never gets database write credentials (ADR-005, ADR-006).
- **CI and containers.** A CI workflow that typechecks, lints, tests, and builds, with a cross-tenant isolation test as a first-class test. Dockerfiles per service plus a local compose, then the containers running on a Juno dev workspace against managed Supabase (ADR-017, [juno-platform-pilot.md](juno-platform-pilot.md)).

## Phase 1: The web walking skeleton (the slice that is the spike)

One workspace, one user, one hand-authored published contract (a minimal Person object: a couple of fields and one identity rule). Then the thinnest end-to-end thread:

1. A minimal web text box posts natural language to the control plane.
2. The control plane writes a `source_message` and calls the Hermes runtime through the Agent Runtime Adapter with tenant context, the contract, and the text.
3. Hermes returns a structured proposal. The adapter validates it with Zod against the contract. Invalid output is rejected, never written (ADR-006).
4. Confirm-each policy holds the proposal in `agent_proposals`. The review queue shows before/after. On approve, the control plane writes the `business_record` and an `audit_event` with the source link (ADR-005, ADR-010).

Start in confirm-each mode. apply-then-report and the weekly report come later (ADR-010). The GO/NO-GO this slice produces (does the seam yield Zod-valid proposals reliably, do the write gates hold, is latency acceptable, do the containers deploy cleanly) is what converts ADR-006 and ADR-017 from "accepted as direction" to "committed."

## What each phase gates

- The **walking skeleton** gates everything. Until the spine is proven, no surface is worth building, because every surface assumes it.
- The **Hermes seam** (inside the skeleton) gates the agent build. Phase-2 estimates depend on its GO/NO-GO (ADR-006).
- The **generic contract-driven UI** is the shakiest technical assumption and is deliberately not on the skeleton's path. The skeleton uses minimal hand-built screens. Whether Lovable can render table/detail/relationship/form views from a contract is a pressure-test taken after the spine works, not assumed (ADR-014).
- The **weekly report** gates apply-then-report mode. Confirm-each is safe without it; apply-then-report is not (ADR-010).
- **Eval cases** gate a workspace switching to apply-then-report. A starter set of entity-matching and disambiguation cases must pass first (ADR-009).

## Non-code tracks to start on day one

These run on their own clock, so start them at the same time as Phase 0 rather than after.

- **A2P 10DLC registration.** US carriers require brand and campaign registration before they carry application SMS, and approval can take days to weeks. Start it now so SMS can go live right after the spine (ADR-010, requirements REQ-032/062).
- **Partnership, IP, and design-partner terms.** ADR-001 ranks this the highest blocking external risk and says settle it before heavy build. It is a business decision, not an engineering gate, but it is named here so it does not get lost.

## Explicitly deferred (do not build in this pass)

Each is named in the ADRs as later scope: the Microsoft Graph connector (ADR-012), the Excel add-in and any arbitrary bidirectional sync (ADR-004), the MCP server (ADR-007), apply-then-report as the default (ADR-010), self-service contract authoring (ADR-002, ADR-016), and multi-provider model selection (ADR-013).

## The verification bar

The skeleton is done when:

- **Spine:** a text through the web box produces a `source_message`, then a held `agent_proposal`, then on approval a `business_record` and an `audit_event` with correct before/after and source link.
- **Containment:** the runtime has no Supabase write credentials and cannot write even if asked; invalid runtime output is rejected by Zod, not written.
- **Isolation:** the cross-tenant test proves workspace B cannot read or write workspace A's rows under RLS.
- **Deploy:** all containers run on Juno against managed Supabase, a preview link serves the web box and the API, and the exact workload templates and env vars are written down.
- **CI:** typecheck, lint, tests (including the isolation test), and build all pass.
