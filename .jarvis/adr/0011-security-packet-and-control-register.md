# ADR-0011: The security packet and control register are tracked deliverables

- **Status:** Accepted (2026-07-09, owner merge of PR #91)
- **Date:** 2026-07-09
- **Relates to:** ADR-0005 (agent tokens), ADR-0008 (typed tools); adopts the
  mechanism of v0's ADR-015 (archive/docs/adr/, historical record)

## Context

Cormac sells into businesses whose IT diligence decides whether a pilot
happens. v0 proved a mechanism worth keeping: a client-shareable security
packet whose claims map, row by row, to enforced controls and the tests that
prove them, policed by a static guard so prose and reality cannot drift
apart silently. The v2 rebuild had no packet until now; the platform-
infrastructure round (#79-#89) added member management, an operator tier,
auth providers, and demo seeding — enough surface that undocumented security
posture became a real cost.

## Decision

1. **The packet is a deliverable, tracked in-repo** at `docs/security/`,
   with internal runbooks at `docs/runbooks/`. It is written for an external
   reviewer and versioned like code.
2. **The control register is the spine.** Every security claim the packet
   makes has a register row: claim, enforcing code, citing test, packet doc,
   status. No doc may claim above its row.
3. **Three honest statuses.** Verified (enforced + cited automated test),
   Partial (enforced with a named gap; manual evidence caps here), Planned
   (not built, never present-tense). Gaps are listed in the packet, not
   hidden.
4. **The guard is mechanical.** `pnpm check:controls`
   (scripts/check-control-register.ts) fails on missing cited tests,
   Verified rows without tests, non-backticked path tokens, orphan tests,
   stale exemptions, and dead doc links. Manual this round (no CI by the
   round's scoping decision); it becomes a CI gate when CI lands.
5. **Register updates ride the same PR as the control change.** A PR that
   adds, weakens, or removes a control updates the register and affected
   packet docs in the same diff. New externally-reachable surfaces get a
   register pass before merge.

## Consequences

- Reviewers (and we) can distinguish "claimed" from "proven" per row; the
  packet survives skeptical reading because its gaps are its own.
- Writing a row before the prose is a forcing function: three rows in this
  round got real tests because Partial was visible (redaction became
  Verified this way).
- Cost: every control change touches docs. Accepted; that is the point.
- The exemption list in the guard is the loophole risk; the policy (only
  correctness-of-non-compliance-logic tests, with a pointer to the real
  rowed control) is reviewer-policed.
