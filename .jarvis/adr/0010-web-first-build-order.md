# 0010 — Build order: the web app is the first client surface; the pane repositions to a flagship enhancement

- **Status:** Accepted (2026-07-08, owner decision)
- **Amended by:** ADR-0014 (2026-07-12) revises point 3 below: the web app MAY present an
  editable spreadsheet-style grid, provided every write flows through the pipeline and the grid
  is a view over the record store, not a copy of the client's workbook. Points 1, 2, and 4-6
  stand.
- **Amends:** the v0 ADR-028 direction as carried into `.jarvis/prd/requirements.md`
  ("Excel task pane is the primary client surface"). This resequences the pane
  investment; it does not reverse it.
- **Builds on:** ADR-0002 (build-order discipline), ADR-0004 (keystone GO; the deferred
  human-played interview), ADR-0009 (pane GO/NO-GO skeleton, now deferred, not
  withdrawn)

## Context

Three facts landed together on 2026-07-08 (`.jarvis/research/microsoft-excel-integration.md`):

- **A verified distribution hole in the add-in channel.** GoDaddy-resold Microsoft 365
  tenants cannot install add-ins by any path (admin center or AppSource); store-disabled
  tenants and consumer accounts widen an unsized blocked population inside the exact
  target segment. Being Microsoft-resident does not mean being reachable through
  Microsoft's add-in channel. The size of the blocked share is unknown and matters.
- **The v2 backend is prototype-ready.** Interview turns, workbook upload, capture,
  proposals, decisions, and the audit trail all exist as live-proven routes. The missing
  piece for a product a human can touch is only a frontend.
- **The product's Excel-ness lives in the contract model, not the add-in.** The working
  interview runs over an uploaded workbook today. The pane adds seamlessness (no upload
  step, live column highlighting inside Excel); it does not add capability.

## Decision

1. **The web app is the first client surface built.** Prototype screen inventory: login
   (Supabase password), workbook upload with a read-only preview that supports column
   highlighting, the authoring interview conversation, capture, the proposal review
   queue (current vs proposed, confirm/reject), a plain records table, and a
   **per-record timeline**.
2. **The timeline is in scope deliberately.** It is a read view over data the pipeline
   already keeps (append-only audit chain plus source messages): for each record, the
   original utterance, the proposal, the decision, and the applied change, in time
   order. It is the web app's native differentiator: the client's workbook holds current
   state; the web app holds history, which a spreadsheet structurally cannot. Pitched as
   "everything Cormac did and was told", never as a mailbox-sync activity feed.
3. **Boundary: the web app never rebuilds a spreadsheet grid.** No inline bulk editing,
   no formulas, no Excel-mimicking filter UX. Bulk edits happen in the client's Excel
   and come back through upload (later sync) or through the agent. Render tables; never
   build a grid editor.
   **[Amended by ADR-0014, 2026-07-12]** An editable spreadsheet-style grid IS now permitted,
   as a governed view over the record store: cell edits stage and commit through the pipeline
   (never direct-to-DB), and the grid is not a copy or two-way mirror of the client's Excel. The
   no-formula-engine / no-macros / no-two-way-sync limits still hold.
4. **The pane repositions from primary surface to flagship enhancement** for tenants
   that can install it. The pane probes (ADR-0009, #67) stay valid and deferred; they
   run when the pane's turn comes. The publisher/DUNS clock starts when the pane
   approaches shipping, not before. The shared-codebase design (one set of components
   over one control-plane API) keeps the pane a mounting exercise plus the Office
   bridge.
5. **Tenant qualification becomes routine.** Every prospect conversation collects:
   reseller (GoDaddy check), Office SKU, desktop vs web Excel. The answers decide which
   experience a client gets, never whether they can be a client.
6. **The human-played interview (ADR-0004 criterion 3) rides the web prototype's
   interview UI.** It no longer waits on the pane.

## Consequences

- `.jarvis/prd/requirements.md` and `executive-summary.md` are edited to match (door
  order; the pane's stable-domain/TLS prerequisite attaches to the pane track rather
  than gating the first deployment).
- #67 stays open and deferred; a new issue tracks the web prototype as the next major
  piece.
- Cost, named: onboarding loses some magic for add-in-capable clients until the pane
  ships; the headline softens to "works everywhere, lives inside Excel where your setup
  allows".
- Moat, named: businesses on locked tenants are unreachable by Microsoft-native
  competitors but fully servable here via web and SMS.

## Alternatives considered

- **Pane-first (the standing plan):** rejected. The distribution hole is real and
  unsized, and pane-first is the slower path to a prototype a human can touch while the
  backend sits ready.
- **Dual-track (web and pane in parallel):** rejected. Solo-founder attention is the
  scarce resource (ADR-0002's lesson), and the shared-codebase design makes sequencing
  cheap.
