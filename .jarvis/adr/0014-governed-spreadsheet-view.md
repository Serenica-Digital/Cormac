# 0014 — The web app is a governed spreadsheet view: an editable grid over the record store, fused with the agent

- **Status:** Accepted (2026-07-12, owner decision)
- **Amends:** ADR-0010 point 3 ("the web app never rebuilds a spreadsheet grid ... no inline
  bulk editing ... Render tables; never build a grid editor"). This ADR revises that boundary:
  the web app MAY present an editable spreadsheet-style grid, provided every write flows through
  the pipeline and the grid is a view over the record store, not a second copy of the client's
  workbook. ADR-0010's build-order decision (web first, pane deferred) and its point 2
  (history/timeline as the differentiator) stand unchanged.
- **Builds on:** the one-writer invariant (`requirements.md`), ADR-0010 (web-first),
  ADR-0004 (keystone), ADR-0002 (attention discipline).
- **Relates to:** #98 (import, the grid's seeding path) and #111 (the governed-grid build).

## Context

ADR-0010 point 3 forbade a grid editor to protect the agent-first thesis ("an assistant that
keeps it current without data entry") and to avoid competing with the Excel a client already
trusts. Two things changed since:

- **The pane is deferred well behind the beta path** (behind EKS, import, onboarding, SMS in the
  2026-07-12 roadmap). The pane was the surface that would have given add-in-capable tenants
  direct manipulation of their real workbook. With it far out, the web app is the only
  direct-manipulation surface for the foreseeable future, for everyone.
- **#98 import creates an immediate correction need.** Bulk-seeding a CRM from a workbook means
  clients must review and fix rows that mapped imperfectly. A read-only table plus "narrate every
  fix to the agent" is a poor correction loop.

The expected experience (post-Copilot-in-Sheets) is conversing with the agent beside your data,
with direct editing. Embedding real Excel (Office for web) is ruled out: it rides the same
add-in/licensing rails that block the GoDaddy-resold target tenants ADR-0010 routed around. A
browser spreadsheet-grid component is the viable path.

## Decision

1. **The web app presents a governed spreadsheet view**: a grid over the workspace record store,
   rendered beside the agent, as the primary data surface (replacing the read-only table). It is a
   view, not a workbook: the record store is the single source of truth. The client's Excel is not
   mirrored or synced by this decision.
2. **All writes flow through the pipeline (invariant preserved).** A cell edit never writes to the
   database directly. Inline edits stage client-side and commit as proposals through
   capture/proposal/confirm/apply/audit. Batch-commit keeps the feel fluid (edit freely, then
   save); per-cell confirmation is not required, but every committed change is validated against
   the contract, applied by the control plane, and audited.
3. **Agent and grid are fused.** Agent-proposed changes highlight in the grid (current vs
   proposed) and are confirmed in place. The per-record timeline (ADR-0010 point 2) remains the
   differentiator and is reachable from the grid.
4. **Editability honors the contract.** Only `editableByUser` fields are user-editable; sensitive
   and agent-only fields behave per the contract's flags.
5. **#98 import is the seeding path.** Import populates the record store the grid views; import
   cleanup uses the same inline-edit-through-pipeline mechanism.
6. **Boundaries retained.** We do not promise a full Excel surface (no formula-authoring engine,
   no macros, no pivots) and we do not become a two-way sync engine for the client's Excel file in
   this ADR. The grid is for reviewing and correcting the CRM, not for replacing the client's
   spreadsheet. The grid component itself (candidates: Univer, AG Grid, Handsontable, Syncfusion)
   is an implementation choice, not fixed here.

## Consequences

- The web app's identity shifts from "read tables + agent" to "a spreadsheet you edit with an
  agent beside it, where every change is governed and audited." Stronger fit for the expected
  experience, and the natural home for import correction.
- New build surface: a grid component, a staging/commit layer that turns grid edits into
  proposals, and in-grid proposal highlighting. Bounded by reuse: the writer (`apply_proposal`),
  contract validation, and the audit chain already exist.
- Cost named: a grid invites manual data entry, in tension with the "keeps it current without
  data entry" thesis. Mitigation: the agent stays the primary capture path and the headline; the
  grid is for review and correction. We resist scope-creep toward a Sheets clone.
- The one-writer invariant and the security-packet story are preserved because writes stay on the
  pipeline. No invariant changes; only ADR-0010 point 3 is amended.

## Alternatives considered

- **Keep ADR-0010 point 3 (read-only tables + agent):** rejected. Leaves the only
  direct-manipulation surface deferred with the pane and fails the expected side-by-side-edit
  experience; poor import-correction loop.
- **Cormac becomes the client's primary workbook (replace Excel):** deferred, not chosen. Larger
  thesis shift ("move into ours" vs "keep yours") and a grid-quality race with Google Sheets.
  Revisit if adoption pulls that way.
- **Live two-way mirror of the client's Excel:** rejected for now. Hardest build (conflict
  resolution, change detection) and leans on the deferred, add-in-blocked pane.
- **Embed real Excel (Office for web):** rejected. Same add-in/licensing rails that block the
  target tenants.
- **Direct-to-DB grid writes:** rejected. Breaks the one-writer invariant and the security-packet
  story.
