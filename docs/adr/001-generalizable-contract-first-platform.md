# ADR-001: Build a generalizable contract-first platform, not a bespoke CRM for one client

**Status:** Accepted
**Date:** 2026-06-06 (decided on the 2026-06-04 pivot call)
**Related:** This is the founding decision; the rest of the catalog descends from it. ADR-002 (contract-first data model) and ADR-004 (Excel as a contract surface, not arbitrary sync) make the data shape and the Excel scope follow from it, ADR-005 (the control plane as the only writer) and ADR-015 (security as a day-one deliverable) follow from going multi-tenant and platform-first, ADR-006 (adopt Hermes as the runtime) is the agent-layer consequence, and ADR-016 (market posture and pricing) carries the commercial constraints named here.

## Context

The engagement began as a services contract: build an "AI-forward" CRM for a small real-estate firm that runs on SharePoint and heavy Excel and wants out of pure-Excel without corporate lock-in. Discovery narrowed v1 to plain-language queries plus reminders and deferred the "text the CRM and it updates itself" feature, on the argument that a wrong read is recoverable while a wrong write corrupts data silently. A proposal went out on that basis.

On the June 4 call the scope changed. The prospective design partner did not want a CRM chosen or built for them. They wanted to partner and build the thing as its own product, for organizations that live in Excel, OneDrive, SharePoint, Outlook, and text. The product they described is one where a user interacts with an agent by text and email and the agent maintains the CRM for them, and where the system meets a business inside the spreadsheets it already runs on instead of forcing a migration into a generic CRM. The write-back feature that had just been deferred on risk grounds is the part they care about most.

Over the following two days the framing sharpened from "an AI CRM" into something more precise: the product is a governed change engine for messy business data, and CRM is its first expression. How "meet them in their spreadsheets" becomes safe and concrete is the contract model, which deliberately rules out arbitrary bidirectional spreadsheet sync. This ADR records the platform-first reframe; the data-shape and Excel-scope decisions are ADR-002 and ADR-004.

## Decision

Build **Serenica CRM Agent** as a generalizable, multi-tenant, contract-first CRM agent platform. The generalizable product is the build.

1. **Platform-first, not client-first.** The thing being built is the product, for many organizations. The first firm is the first instance of it, not the scope of it.
2. **The first design partner is a prototype, a reference deployment, and a venture stake, not a customer.** They help shape the product and run on it first. The partnership is premised on the product as a business of its own, so the relationship is not "we configure them a CRM and invoice for it."
3. **The write-back loop is the core thesis.** Capture an update by text or email, the agent interprets it against the client's contract, and the change is applied or proposed under policy. This is the feature the original proposal deferred, and it is the thing the frontier labs currently leave human-gated. That is exactly why it is worth building toward, and exactly why the trust scaffolding around it (the contract, the proposal/confirmation pipeline, the audit log, the weekly report) is the product rather than garnish.
4. **v1 is redefined.** v1 proves the platform thesis with one real design partner. It is not the delivery of a finished CRM to a single customer. The cut line for v1 is "the smallest slice that proves a client's spreadsheet can become a governed contract the agent operates on safely," not "everything the partner's firm needs."

## Consequences

### Architectural

- Everything downstream follows from platform-first. The data model has to be contract-first from the first line of code (ADR-002) rather than a fixed schema generalized later. Multi-tenancy is a day-one property, not a retrofit. The control plane becomes the trust layer that makes agent writes safe (ADR-005), and security evidence becomes a first-class deliverable rather than later cleanup (ADR-015).
- The central build risk shifts from "ship a CRM" to "build a schema-driven application engine, in service of one customer at first." A contract-first product cannot lean on bespoke screens for Deals or People. It needs a generic, metadata-driven UI generated from each client's contract, which is closer to building a small Airtable or Notion than a CRM. This is the single largest technical risk the platform-first choice creates, and it is carried deliberately as the bet being validated.

### Commercial and legal

- Partnership and IP terms become a gating business question. Who owns the product, the code, the schema engine, and the upside is unresolved, and it is the highest-ranked risk on the project. It should be settled before heavy build, because platform-first means the IP being created is the company, not a one-off deliverable.
- Pricing has to work at SMB scale. The working constraint is sub-$40 per seat-equivalent, or the target customer is out of reach. The number is unsettled and is recorded as a constraint, not a decision, in ADR-016.

### What this retires

- The Notion-versus-custom framing, the read-versus-write-asymmetry headline, and the two proposal PDFs are superseded. They are kept as history in the private development notes. Any later document that still treats "pick a CRM for the firm" as the live question is stale by definition.

## Alternatives considered

**Buy an existing AI-native CRM for the firm (Attio, Day.ai, Notion, HubSpot).** This was the live recommendation right up to the pivot call, and it was well-grounded. Attio was the strongest buy candidate: clean modern UX, native email and calendar sync, a first-party Claude connector, and AI writes that already request human confirmation. Day.ai was the best fit for shops whose relationship context lives in email. The research was honest that for a generic CRM buyer, buying is often the correct answer. Rejected here because every one of them is rent rather than own, each solves a single client and leaves no product or IP behind, and the partnership is explicitly about building the product rather than configuring someone else's. The competitive read also stands as a permanent guardrail: a two-person shop cannot win a feature war against these incumbents, so the product only makes sense as a wedge they structurally will not serve (ADR-016), which a "buy Attio" path forecloses.

**Build the firm's CRM bespoke first, then generalize it later.** The lower-risk-looking path: ship one firm's CRM, learn, then extract a product. Rejected because bespoke-first hard-codes one firm's objects, lifecycle, and vocabulary into the schema and the UI, and the generalization gets bolted on afterward in brittle ways. The explicit design intent is the opposite, a client-specified schema contract from the start, with the first firm as the first contract rather than the hard-coded model (ADR-002). Generalizing after calcification is the failure mode this decision exists to avoid.

**Stay a services engagement and deliver the proposal as written.** Finish the Notion-versus-custom proposal, take the contracting fee, move on. Rejected as superseded by the partnership and the platform ambition, and because it leaves the most valuable thing, the IP, unbuilt.

**Adopt an existing spreadsheet-database product (Airtable) as the core.** Considered because Airtable is close to the spreadsheet-database hybrid the product wants to be. Rejected at the platform level because it makes a vendor-owned system the source of truth, with per-tenant auth and webhook limits that fight a multi-tenant SaaS that needs its own audit and write-safety model. It stays relevant as a possible connector and as design inspiration; the full reasoning lives in ADR-003.

## Open items

1. **Partnership, equity, and IP terms.** Who owns the product and the upside, and what the partner's stake is. Unresolved, highest-ranked risk, should be settled before heavy build. This is a business-formation question that lives outside the code.
2. **The v1 cut line.** Platform-first makes scope creep easy. v1 can accrete the contract engine, two agents, SMS, email, web chat, thick MCP, an Excel add-in, Microsoft connector levels, BYOK, weekly reports, audit, and RBAC all at once. The smallest slice that actually proves the thesis needs to be named and held. Belongs in the PRD.
3. **Pricing model.** Sub-$40 per seat-equivalent is a constraint, not a model. The model is unsettled (ADR-016).
