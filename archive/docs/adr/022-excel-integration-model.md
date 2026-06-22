# ADR-022: Excel integration model: contract-generated workbooks, author-versus-data roles, validate-at-sync

**Status:** Accepted
**Date:** 2026-06-09
**Related:** Refines ADR-004 (Excel is a contract and work surface) by settling what the live data surface actually is. It binds the role split to ADR-008 (two agent roles) and the RBAC of ADR-011, keeps enforcement on the ADR-005 boundary (the control plane is the only writer), generates the workbook from the contract of ADR-002 the way the UI is a generated surface, stores nothing new beyond the JSONB model of ADR-019, and adjusts the posture of ADR-012 (Microsoft connector) from "live Excel is a deferred tier" toward "live Excel is first-class, with manual upload as the floor." The authoring half is ADR-023.

## Context

The wedge is meeting clients in Excel (ADR-001, ADR-016). The hard constraint is that Excel can never be the writer or the source of truth, and arbitrary bidirectional sync with whatever workbook a client already keeps is the trap ADR-004 deferred as Level 4. The tension that forced this ADR is commercial: if a client's first experience is "this is not really Excel, it is your web app with an import button," trust and interest collapse immediately, and the wedge is gone. So the question is whether live Excel can be a first-class, early experience without reopening the arbitrary-file nightmare.

The resolving insight is that "keep working in Excel" hides two different promises:

- **Excel as a surface we control:** a workbook we generate and constrain, living in the client's own OneDrive, that round-trips safely.
- **Excel as their arbitrary existing file:** sync, both ways, with whatever sheet they already keep, formulas and merged cells and renamed columns and all.

The first is achievable and genuinely live. The second is the deferred trap, because an arbitrary file hands the system no stable identity, no types, no validation, and no conflict rules. The mess belongs only to authoring, where it is digested once into a contract (ADR-023). The live data surface is clean by construction.

A second clarification settles "won't it block them from saving bad data." Excel's native data validation only fires on manual entry, is bypassed by paste and fill, and there is no reliable way to block a save on invalid content (the only mechanism that ever did, a macro hooking the save event, is killed by modern IT and by Excel on the web and Mac). So the file can guide, but it cannot enforce. Enforcement has to be where it always was: the control plane, at sync time. This is not a weakness, because a client file can never be trusted as an authority regardless of what it can self-enforce.

## Decision

### 1. The live Excel surface is a contract-generated, contract-constrained workbook, not the client's arbitrary file

The system generates the workbook from the published contract: one Excel Table per object, columns in contract order with display labels, enum fields as dropdown (list) validation, typed fields as number or date validation, hidden and locked columns carrying the stable record ID, field IDs, and contract version, sheet protection on the headers and hidden columns, and conditional formatting that flags an out-of-contract value in red even when it arrives by paste. The workbook is a generated surface of the contract in the same sense the UI is (ADR-002, and the generated-surfaces idea in the enterprise-ontology research). Regeneration beats hand patching: when the contract changes, the workbook is regenerated, not edited by hand.

### 2. Author-versus-data roles, bound to RBAC

Two populations touch Excel for two different reasons, and the split is a trust boundary (ADR-008):

- **Manager and admin users author or change the contract.** This is the messy step: bring a real workbook, the Workbook Contract Agent (ADR-023) elicits meaning through guided questions, and an admin reviews and publishes. Web-only, agent-assisted, governed by the publish gate (ADR-002), gated by the publish capability in RBAC (ADR-011).
- **Regular users only ever touch the generated, constrained workbook.** They do day-to-day data work inside a workbook that already carries the contract as rules. They cannot reshape the contract, in principle, because authoring is a different role on a different surface.

The mess is digested once at authoring. Everything downstream operates on clean structure.

### 3. Excel guides, the control plane enforces

In-sheet validation, dropdowns, and conditional formatting are best-effort front-line guidance that make most bad input never happen and flag the rest. They are not the gate. The authoritative gate is contract validation at sync time in the control plane (ADR-005): every changed row is validated against the active contract before anything is written. A plain save does not persist; the connector bridges the file to the control plane. An off-contract row becomes a flagged proposal with a stated reason, never a silent write and never a silent drop.

### 4. The connector is the bridge, scoped to our workbooks and selected files

A saved file reaches the control plane only through a connector, and there are two candidate mechanisms:

- **An Office add-in** that reads the changed rows and submits them to the control plane on a Sync action.
- **Graph background sync** that reads the selected workbook from OneDrive through workbook sessions and delta detection.

The choice is deferred to a spike (open item). Either way the connector is least-privilege: an add-in operates only on workbooks carrying our hidden contract marker, and Graph sync touches only the specific file the user selected through the picker, never the whole drive.

### 5. Live Excel is first-class, with manual upload as the always-on floor

Manual upload (Level 0, no Graph, no consent) remains the floor that always works. Live Excel is built and pitched as a prominent early capability for the segment that can grant access, not as a quietly deferred Level 3. Graceful degradation (ADR-012) is the engineering safety net that keeps a stalled Microsoft consent from blocking onboarding, not a reason to under-build the live experience. This adjusts ADR-012's framing without removing its floor: build the live surface early, and degrade to upload when a tenant blocks consent.

## Consequences

### Architectural

- Building the workbook generator is new work, and it is deterministic given the contract, so it inherits the contract's correctness rather than adding a new source of judgment. The arbitrary-file data-integrity nightmare is removed by construction, not by heroics.
- Conflict handling does not vanish. A user can edit the sheet while the agent edits the same record. The stable hidden IDs make conflicts precisely detectable, and ADR-004's rule holds: a conflict becomes a proposal, never a silently chosen winner.
- The contract bridges Excel to contract fields to the JSONB store (ADR-019), not Excel to per-object SQL tables, because there are none. The system maps data and meaning. Excel formulas and computed cells become contract-level derived or display fields, or they stay out of sync. Formula logic is not round-tripped.

### Trust and security

- Enforcement stays server-side, consistent with ADR-005, and the file is never an authority. The security packet's Excel story is exactly this: the workbook guides, and the control plane validates every write against the contract before it lands (ADR-015).

### Commercial

- Live Excel becomes a headline capability instead of a deferred tier, which strengthens the wedge. This is contingent on the consent reality (ADR-012), which is why manual upload stays the floor.

## Alternatives considered

**Arbitrary bidirectional sync of the client's existing file.** The partner's original holy grail, and the thing a client's gut asks for. Rejected again, as in ADR-004 Level 4. The contract-generated constrained workbook delivers the live-Excel feeling (their app, their OneDrive, their data, two-way) without the integrity problem, so the deferral costs nothing the product actually needs.

**The file as the enforcement boundary, blocking save on invalid content.** Attractive because it sounds like "the workbook enforces the contract." Rejected because Excel cannot reliably do it, and because a client file can never be trusted as an authority regardless. The in-sheet rules guide; the control plane gates.

**Keep live Excel deferred as Level 3.** The prior posture. Rejected as too conservative for a product whose entire wedge is Excel-nativeness. A hollow first experience kills the wedge, so live Excel is prioritized, with degradation kept as the floor rather than as the headline.

## Open items

1. **Connector mechanism.** Office add-in submit versus Graph background sync versus a hybrid, decided by a spike that weighs the consent surface, latency, and build cost.
2. **Graph's real Excel capabilities.** Whether dropdowns, validation, sheet protection, and hidden columns are set through Graph or by generating the .xlsx server-side and hosting it. Graph's Excel API has known gaps, request limits, and session constraints (the Excel research note).
3. **Consent reality for the target segment.** Whether a typical client can self-consent to delegated, selected-file access once we are publisher-verified, or whether it still hits admin consent (ADR-012).
4. **Conflict-resolution depth in v1.** How much of the conflict-to-proposal machinery ships with the first live surface versus later (carried from ADR-004).
5. **One canonical level ladder.** ADR-004 (Levels 0 to 4) and ADR-012 (Levels 0 to 5) are two overlapping ladders. They should be reconciled into a single tiering so the product stops being described against two maps.
