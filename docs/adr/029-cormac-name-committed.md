# ADR-029: Cormac is the committed product name; the build proceeds ahead of formal clearance

**Status:** Accepted
**Date:** 2026-06-12
**Related:** Amends ADR-024 (naming structure). The structure survives intact: Serenica Digital is the LLC and signs everything formal; Cormac is the product, whole. What changes is the clearance gate: ADR-024 held commercial use of "Cormac" behind a clearance bar; this record commits to the name now and converts the bar into a follow-up task.

## Context

ADR-024 settled the naming structure but left "Cormac" a working name, with committed commercial artifacts gated on clearance. Since then the name has propagated through the docs, and the first hard-to-rename artifacts are approaching on the build plan: the Excel pane's manifest-pinned domain (M1/M3), the A2P brand and campaign registration (M6), and the AppSource listing (post-v1). Each is client-facing and effectively permanent, so the name decision could no longer ride along unsettled.

The founder ran a USPTO knockout search on 2026-06-12 in the relevant classes (009, software; 042, software services) and found no conflicting registrations for "Cormac". A knockout search is not a full clearance: it does not cover common-law (unregistered) marks, state registrations, confusingly-similar variants, or other classes. The founder weighed that residual risk against the cost of carrying an unsettled name into permanent artifacts and chose to commit.

## Decision

1. **Cormac is the product name, used everywhere the product speaks**: the codebase (package scope `@cormac/*`, compose project, MCP server identity, runtime profile), the UI, the agent persona, the docs, and the forthcoming client-facing artifacts (pane domain, A2P registration, store listing). The "(working name)" qualifier is retired.
2. **Serenica Digital remains the company**, unchanged from ADR-024: the legal entity on contracts, the security packet's issuer, the GitHub organization, and therefore the `ghcr.io/serenica-digital/*` registry namespace. Infrastructure that identifies the company keeps the company's name; that is correct, not residue.
3. **The clearance bar converts to a follow-up obligation, not a gate**: commission or perform a fuller clearance (common-law sweep, variant search) and file a trademark application before the AppSource listing goes live, which is the moment the name becomes loudest and hardest to walk back. Tracked with the publisher track (#53).
4. **Known deliberate leftovers** of the old name in the product's code: the `serenica.allow_audit_purge` Postgres setting inside applied migrations (renaming requires a new migration; do it when a migration next touches purge) and the GHCR paths above.

## Consequences

- The pane-domain and A2P decisions in the build plan are unblocked on naming.
- If a conflict surfaces later, the blast radius is the rename cost this ADR just paid (about an hour in code) plus whatever client-facing artifacts exist by then; the follow-up clearance in (3) exists to shrink the window in which that can happen.
- The docs convention "Cormac (working name)" on first external use is retired; external documents say Cormac, by Serenica Digital.

## Alternatives considered

**Keep the clearance gate and name infrastructure after the company** (the recommendation standing before this decision). Safer against trademark risk, but it leaves the product unnamed in its own code and pitch surfaces while the first permanent artifacts arrive, and the founder judged the knockout-search result sufficient to carry the residual risk. The follow-up obligation in (3) preserves most of the safety at none of the delay.

**Commission full clearance first, commit after.** Cleanest legally; rejected for pace. The build is at the milestone where the name starts binding (M1 design outputs), and a formal clearance cycle would put a vendor's calendar on the critical path.

## Open items

1. Full clearance and trademark filing before the AppSource listing (rides with #53).
2. Rename `serenica.allow_audit_purge` in the next migration that touches the purge path.
3. The Supabase dev project and the GitHub repo still carry `serenica-crm-agent` names; rename at convenience (the repo rename auto-redirects), or leave, since neither is client-facing.
