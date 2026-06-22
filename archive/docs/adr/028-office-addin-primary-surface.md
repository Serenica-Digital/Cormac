# ADR-028: The Office add-in as the primary client surface; the Microsoft integration posture gets a fresh review

**Status:** Accepted as direction; build commitment is gated on a research and design phase, the ADR-006/ADR-023 pattern. The follow-up status ADR records the GO/NO-GO and the re-scoped issue set.
**Date:** 2026-06-12
**Related:** Amends the emphasis of ADR-012 (Microsoft 365 as an optional tiered connector) and partially supersedes ADR-014's framing of the web app as the primary control surface (Lovable-for-UI and trust-enforced-server-side survive intact). Re-frames ADR-022's Excel question: the add-in moves from one sync-transport option among several (#31) to the primary UI investment. Affects where #17 (the authoring agent) builds its interview UI. Folds #31, #32, and #33 into the research phase. Evidence: the competitive findings in [docs/research/competitive-analysis.md](../research/competitive-analysis.md) (the June 12 RapidStarter update), the founding demographic definition (ADR-001), and the surface reasoning of ADR-007.

## Context

The product's UI plan grew from two early postures. ADR-012 made Microsoft 365 an optional, tiered connector, reasoning from enterprise consent friction: Graph permissions are admin-granted, IT-reviewed, and frightening, so the product should work with zero Microsoft permissions. ADR-014 made the web app the primary control surface, with Excel integration arriving later through whichever transport #31 selected (add-in versus Graph sync versus hybrid). Under those postures the add-in was a sync mechanism, the web app was where clients would live, and "works without Microsoft" was pitch material.

Four findings, accumulated since, suggest the original design plan may be significantly flawed:

1. **The demographic is Microsoft-resident by definition.** ADR-001 defines the target as organizations living in Excel, OneDrive, SharePoint, Outlook, and text. The first design partner runs on SharePoint and heavy Excel. "Works with zero Microsoft permissions" defends a client that does not exist in the segment, and it priced the add-in's friction wrongly by conflating two different Microsoft asks: tenant-level Graph consent (heavy, admin-granted, what ADR-012 rightly feared) and add-in installation (light, often user-self-served from the store, and Office.js access to the open workbook requires no Graph permissions at all; installing is the consent).

2. **The authoring interview is categorically better inside Excel.** The task pane is a web page we host, rendered inside Excel, with Office.js as the bridge to the open document. The Workbook Contract Agent's consultation (ADR-027 section 5) can read the client's actual open workbook with no upload step and visually highlight the column it is asking about. Onboarding happens inside the tool the client trusts most, against their real data. No web wizard reaches that, and onboarding is the product's keystone moment (ADR-023).

3. **The competition validates the channel and sharpens the boundary.** RapidStarter (Forceworks) is an agent-maintained CRM with per-change tap-approval at $99/month, sold through the Microsoft marketplace to exactly our demographic: proof the channel converts for this category, and proof that Microsoft-native rivals exist. Its construction is also the cautionary half: built on Microsoft's stack, it models only the fixed contacts-companies-deals trio detected from M365 exhaust, has no Excel surface, and cannot hear a text from a parking lot. The lesson is a boundary: **Microsoft as distribution, never as identity.**

4. **One pipeline makes doors cheap.** ADR-007's architecture means a task pane is a thin adapter like every other surface: the same React components, the same control-plane API, no client-side trust. An Office add-in is additionally multi-host by platform design; the same web code can later mount in Outlook (natural for us, since email is already a capture channel) and Teams. The marginal cost of the flagship door is low; the original plan's web-first sequencing bought safety we did not need at the cost of the demographic fit we did.

## Decision

### 1. The direction

- **The Office task pane add-in becomes the primary client surface**, hosting both agent roles: the authoring interview (against the live open workbook) and the operator surfaces (capture, review queue, proposal diffs).
- **The web app is demoted to the admin, trust, and fallback door**: role management, audit review, the learning queue, workspace settings, and the surface that works when Microsoft is unavailable or a client lacks Excel. These stay on neutral ground we fully control; they are what the security packet points at.
- **SMS is untouched** as the field-capture channel. The two-surface pitch: Cormac lives inside the Excel you already work in, and answers the texts you send from the field.
- **Excel is the first host; Outlook is the candidate second host;** nothing is ever built on Dataverse, Power Apps, or Power Platform. The spine (control plane, contract, Postgres, agent runtime) stays ours; Microsoft products are doors.
- **Distribution path:** centralized deployment (the client admin pushes our manifest) for the pilot, AppSource publication with verified publisher for general availability.

### 2. The gate: a research and design phase before build

The direction is accepted; the build is not yet planned, because the platform constraints are unverified assumptions and the original Microsoft posture deserves re-derivation rather than patching. The phase takes a fresh look at the entire Microsoft ecosystem integration and must answer, with sources and where possible with a working spike:

1. **Add-in platform reality.** Manifest model (unified versus XML) and what each supports; host and platform parity (Excel on Windows, Mac, web); Office.js capability limits against our actual flows: reading large multi-sheet workbooks, range highlighting, dialog and pop-out UX for the draft-contract review, pane lifecycle and state. What breaks the interview design, if anything.
2. **Auth inside the pane.** Supabase session flows in the task-pane sandbox versus Office SSO and nested app auth against Entra; what each means for ADR-011's broker model and for what an IT reviewer sees.
3. **The ADR-012 ladder, re-derived.** Which Graph permissions the product actually needs and when, starting from zero; whether the tiered-connector model survives contact with the add-in-first posture; reconcile the two Excel/Microsoft level ladders the docs currently carry (#33).
4. **The sync question, re-scoped.** Whether the add-in subsumes the validate-at-sync engine's UX (#30) and how the generated workbook (#29) is delivered and refreshed through the pane; what remains of #31's transport question once the add-in is the primary surface rather than one option.
5. **Store mechanics.** AppSource validation requirements, timelines, rejection patterns; verified-publisher steps and cost (folds #32); centralized-deployment mechanics for the pilot partner, including what their admin must do and see.
6. **Dependence and fallback.** What Microsoft controls (sandbox rules, review policy, API deprecations), the realistic blast radius of each, and the floor of functionality the web fallback must always provide.
7. **Positioning boundary tests.** Written answers to "why not build on Power Platform" and "what we will never accept from the Microsoft stack," so distribution-not-identity is a documented line rather than a mood.

Deliverables: a research document in [docs/research/](../research/), a design for the pane architecture (one codebase, host mounts, shared components with the web app), and the follow-up status ADR with the GO/NO-GO and re-scoped issues. The phase should include a small working spike (a sideloaded pane reading the demo workbook and calling the control plane) because several answers above are only trustworthy when exercised.

## Consequences

- **#17's UI plan pauses on the mount point.** The agent-side work (the interview loop, #37 multi-turn state, the ask-user protocol, the eval-harness extension) is host-agnostic and proceeds; where the wizard renders waits for this phase, and that is acceptable sequencing because the agent work is the longer pole.
- **#31, #32, #33 fold into the research phase** rather than running as separate threads against a stale framing.
- **The pitch changes.** "Works with zero Microsoft permissions" demotes from headline to fallback fact. The headline becomes the two-surface story, and the AppSource listing becomes a deliverable with the same naming-clearance dependency as everything client-facing (ADR-024).
- **The security packet gains a section eventually**: add-in deployment model, pane sandbox posture, and what the Microsoft dependence does and does not touch (it never touches the write path, the data, or the gates).
- **A risk is accepted and named:** deeper Microsoft surface coupling means Microsoft policy changes can degrade the flagship door. The mitigation is structural and already built: every surface is a thin adapter over one pipeline (ADR-007), and the web fallback always works.

## Alternatives considered

**Stay web-primary (the ADR-014 status quo).** Rejected: it optimizes for a client posture (Microsoft-averse) that the founding demographic definition excludes, and it forfeits the onboarding experience that best demonstrates the keystone. The web app survives where it is genuinely strongest, as the admin and trust surface.

**Go Microsoft-native (Dataverse, Power Platform, Teams-first).** Rejected: it is RapidStarter's home turf and eventually Copilot's, it would surrender the contract-first spine to Microsoft's data model, and it inherits the fixed-schema assumption the product exists to reject. The competitive research treats this as the boundary case, not an option.

**Commit and build the add-in now, research later.** Rejected: the original design plan got the Microsoft posture wrong once already by reasoning from assumptions instead of platform reality, and the founder has flagged the plan as potentially significantly flawed. The phase is short, the spike is cheap, and the ADR-006/ADR-021 precedent is that direction commits and evidence gates.

## Open items

1. **The research and design phase itself**, tracked on the board, with the seven questions above as its acceptance list.
2. **Outlook host timing**: candidate second host, decided in the follow-up ADR.
3. **AppSource listing copy and naming**: blocked on ADR-024's clearance bar for committed commercial artifacts.
4. **The pilot partner's admin path**: centralized deployment requires their M365 admin; sequence the conversation early so it never blocks a session.
