# ADR-007: One agent service, many doors (thick MCP, not raw CRUD)

**Status:** Accepted
**Date:** 2026-06-06
**Related:** Extends ADR-005 (the control plane is the only writer) into the multi-surface design. ADR-008 (two agent roles) and ADR-002 (the contract) are what the single service operates on, ADR-013 (Claude-first, BYOK) explains the billing split this enables, and ADR-014 (Lovable for the UI) builds the internal doors.

## Context

The product is reachable from many surfaces: web, the upload wizard, SMS, email, and a Claude/MCP connector. The failure mode is obvious if each surface invents its own logic. The CRM answers one way over text and a different way in Claude, writes happen through different paths with different safety, and the same business logic is reimplemented several times. For a trust-sensitive product, a CRM that answers differently in two windows is a CRM people stop trusting.

The sharpest version of this is the connector. The naive MCP server exposes thin tools (search_contacts, list_deals, update_deal) and lets the client's own Claude do the reasoning. That Claude has no idea about our skills, our contract, our aliases, our "which Dave" disambiguation, or our confirmation rules, so the team gets our tuned brain over text and a generic brain in Claude. Worse, a thin write tool lets the client's Claude push changes that bypass our proposal, approval, and audit pipeline, which breaks the entire trust model (ADR-005). The same risk in a different costume is BYO-AI: making the client's Claude the reasoning engine for the whole product (ADR-013).

## Decision

There is one agent service, and every surface is a client of it.

### 1. Adapters over one pipeline

Each surface is a thin adapter over a single command and proposal pipeline that exposes internal capabilities, not raw CRUD: `captureUpdate`, `askCrm`, `submitWorkbookDraft`, `prepareBrief`, `listPending`, `applyProposal`. Every write-like action flows through the one pipeline (validate actor and workspace, load the active contract, invoke the runtime if needed, normalize the structured change, check policy, create a proposal or auto-apply, write audit). Tools are internal product capabilities first; a protocol like MCP is one way to expose a subset of them.

```
Internal tool / command layer  (the one pipeline)
        ^        ^        ^         ^          ^
      web     wizard     SMS      email      MCP
   (direct)  (direct)  (direct)  (direct)  (external)
```

### 2. Internal doors call the service directly

The web chat, the upload wizard, the SMS handler, and the email ingester are inside the trust boundary and call the agent service directly. They do not go through MCP, because routing our own UI through an external protocol to reach our own backend is backwards. Internal doors are also deliberately richer than the external one: the web chat can render proposals inline, show before-and-after diffs, offer one-tap approve, surface provenance, and hand off into the wizard. That asymmetry is correct, not a gap to close.

### 3. The one external door is MCP, and it is thick

The MCP connector exposes a curated subset of capabilities for an outside AI (someone's own Claude). Its tools call our agent and run the same pipeline, so `ask_crm` runs the exact flow SMS runs (load skills and contract, call the tuned model, query, provenance-check, format) and returns a finished answer. The client's Claude becomes a presenter and router, not a competing intelligence. No raw writes over MCP, ever; write-like tools create proposals through the same pipeline. For trivial reads where a generic model is fine, a lighter tool can instead inject governed context (the contract, the field glossary, alias definitions) into the response, which narrows the quality gap without a second model call and keeps cost down.

## Consequences

- One business-logic layer means consistent behavior across surfaces, one place to test, easier runtime containment, and the freedom to add a surface later without rewriting logic.
- The billing split falls out cleanly (ADR-013). A client's Claude seats power the outer chat wrapper; the reasoning inside our tools is billed to our key or their BYOK key, exactly like any other channel. Thick tools plus BYOK is the complete, honest answer to "use the Claude we already pay for": their seats power the conversation, their key powers the reasoning, and they still get our intelligence layer because it is our agent doing the thinking. A thin connector could not offer that without splitting the brain.
- The upload wizard is the most strategically important door, because it does not just consume the intelligence layer, it authors part of it. Its output is the contract every other door reads (ADR-008, ADR-002), which is why it is web-only and admin-gated rather than an MCP tool.

## Alternatives considered

**Thin MCP exposing raw CRUD.** The default connector. Rejected because it splits the brain (generic Claude reasons without our governed layer) and bypasses the safety pipeline on writes. The fix is to move intelligence server-side into thick tools, which MCP fully allows; thin versus thick is our design choice, not a protocol constraint.

**BYO-AI as the architecture, the client's Claude as the reasoning engine.** Rejected because the headline feature is server-driven: a Twilio webhook fires, the backend runs the model, it writes, with no human at a Claude window in the loop. BYO-AI over MCP would ship only the interactive read half, which Attio's connector already does, and lose the autonomous write-back that makes the product different. Full reasoning in ADR-013.

**Per-surface write logic.** Let SMS, web, Excel, and the connector each handle their own writes. Rejected outright as the duplicated-logic, inconsistent-behavior failure this ADR exists to prevent.

## Open items

1. **Write-op exposure to the runtime.** Whether to register our write and proposal operations as native Hermes tools or via an MCP server we host (ADR-006), and how the runtime calls back into the tool layer under the control plane's policy rather than reaching the database.
2. **Dogfooding.** Whether the web chat calls our own MCP server internally to harden the external connector, or calls the service API directly. An internal detail either way, but it affects how much the external connector is exercised in normal use.
