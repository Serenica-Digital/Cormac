---
description: Onboard a fresh session: read the decision record, the PRD, and the current build state, then report back before starting work.
argument-hint: [optional focus, e.g. "security packet" or "runtime seam"]
---

# Serenica CRM Agent: session onboarding

You are a fresh agent on this project. Before doing any work, build a working model of three things: what the product is, the decisions that shaped it, and where the build stands right now. CLAUDE.md (already in context) gives the vocabulary and the invariants; do not restate it, internalize it. This command tells you what to read and in what order.

Read efficiently. Make independent Read calls in parallel. The "always" sections below are the required pass; the "on demand" material is indexed so you can pull it when the session's work touches it.

## 1. The map (always)

Read `docs/README.md`. It is the rulebook for where every kind of document lives, the status-header convention, and the house rules (no personal names in committed docs, tight declarative style). Everything below dereferences it.

## 2. Decisions (always)

The ADRs are the project's brain. The PRD says what we are building; the ADRs say why we are allowed to believe it.

Read `docs/adr/README.md` for the full catalog, then:

- **The spine, read fully:** ADR-001 (platform-first), ADR-002 (contract-first data model), ADR-005 (control plane is the only writer), ADR-006 (Hermes runtime behind a swappable adapter), ADR-007 (one agent service, many doors). These five generate the invariants in CLAUDE.md.
- **The newest decisions, read fully:** the four highest-numbered ADRs in the index, whatever they are today. They record where the build actually stands and which open items are next.
- **Status flags:** any ADR whose status is more nuanced than plain "Accepted" (superseded, seam committed, pending, accepted as direction) is telling you about open risk. Note each one and what it says is unproven.
- The rest: know their titles from the index. Read on demand when the work touches them.

## 3. Product shape (always)

Read in this order:

1. `docs/prd/architecture.md`: the trust topology. Which boundary each component sits in and who may write what.
2. `docs/prd/contract-model.md`: how a client workbook becomes the governed, versioned semantic contract, and the learning loop as governed data.
3. `docs/prd/build-plan.md`: the build order, what gates what, what is explicitly deferred, and the verification bar.

On demand (do not read now unless the focus calls for it):

- `docs/prd/requirements.md`: numbered REQ-IDs with acceptance criteria. Consult when implementing or reviewing a feature.
- `docs/prd/v1-scope-architecture-matrix.md`: the v1 in/deferred cut and sprint sequencing.
- `docs/prd/juno-platform-pilot.md`: the Juno pilot outreach plan.

## 4. Reference indexes (awareness, not full reads)

- Run `ls docs/research/`. These are external evaluations (Hermes runtime, Juno platform, Microsoft 365 connector, SMS/A2P compliance, Excel sync, Supabase hardening, vendor risk, Anthropic skills). Each states how the finding applies to us. Read one only when the session's work depends on it.
- Read `docs/security/README.md`. It is the index of the client-facing compliance packet and explains the chain: claim, then enforced control, then test, then packet doc. `docs/security/control-register.md` is the source of truth for control status. The packet must stay a true summary of enforced controls; if your work adds or changes a control, the register and packet move with it.

## 5. Current build state (always)

The docs describe intent; the tree describes reality. Check both:

- `git log --oneline -15` and `git status`: what landed, what is in flight and uncommitted.
- Root `README.md`: package layout, quick start, and the check commands (`pnpm typecheck`, `pnpm lint`, `pnpm test`).
- `ls docs/notes/handoffs/` and read the newest handoff. Handoffs are the candid, private accounting of what a prior session actually built versus what it claimed, including corners cut. Trust them over green checkmarks.
- `ls docs/notes/convos/` for the most recent dated conversation notes if you need the latest thinking. `docs/notes/` is gitignored and private; `docs/notes/archive/` is superseded material, never current scope.

## 6. Report back, then stop

Produce a short orientation brief for the user:

1. The product in two sentences, in the project's own vocabulary.
2. The invariants you are bound by (one line each).
3. Where the build stands: current phase against the build plan, what the newest ADRs say is committed versus pending, and what the latest handoff flags as claimed-but-unverified.
4. Open items most likely to matter this session.
5. Anything contradictory or stale you noticed between the docs and the tree (flag it, do not silently fix it).

If a focus was given ($ARGUMENTS), additionally read the docs that bear on it and fold that into the brief.

Then ask what the session's task is. Do not start work, propose refactors, or edit anything until the user directs you.

## Style contract for everything you write here

From CLAUDE.md, enforced in review: tight and declarative. No em-dashes. No "not X, but Y" reversals. No forced analogies. State what is true and what is open; flag overstatements rather than smoothing them over. When a decision changes, write a new ADR and mark the old one superseded; never edit a settled decision out of the record.
