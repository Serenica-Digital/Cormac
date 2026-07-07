# v0 retrospective: what the transcripts actually say

Digest of all 45 session transcripts from this project (Claude Code + Codex, 2026-06-06 through
2026-07-07, ~33.7M raw tokens projected to a ~1.1M token spine, read in full by ten readers).
Written 2026-07-07 to recover the insights and pain points worth carrying into the rebuild.
Honesty over polish: this records reversals, unproven claims, and dead ends as they happened.

---

## The arc in one paragraph

Cormac was founded, documented, built, and archived in thirteen days. June 6: contract-first
model articulated, Hermes adopted, Juno adopted the same day after one meeting, 21 ADRs and a
live walking skeleton by the end of the first weekend. June 9-12: real Hermes integration over
an MCP tool surface, governed learning designed, managed Supabase. June 11-15: knowledge layer
(ADR-027), Excel pane pivot (ADR-028), and the realization that 90% of the effort had served the
operations agent while the authoring agent, the stated keystone, sat at zero build. June 13-18:
three sessions of env/secrets rework, then Terra packaging, kind rehearsal, multi-arch images.
June 18: the Juno onboarding call invalidated the entire deployment track in one hour. June 19:
v0 archived, main and dev reset. June 22-29: hands-on on the real Juno cluster hit three
blocker-class platform bugs in one session. The rebuild was declared but not started.

---

## Flaw 1: the trust-boundary misconception (MCP as the write path AND the read path)

**The sound part.** The invariant "the control plane is the only writer" was correct from day
one and was enforced and proven live: schema-validated proposals, atomic apply RPC, append-only
audit, runtime holding no DB credentials, RLS isolation tested against real Postgres. None of
that was the flaw.

**The flaw.** The boundary was *implemented* as "all agent communication flows over MCP." The
moment is on record: June 6, Codex session, the founder asks "so wait, would the write be
happening through like an mcp server then we build?" and the design is affirmed. From then on,
everything the agent could see or do was bounded by four thick MCP tools (`get_active_contract`,
`search_records`, `get_record`, `submit_proposal`), each a serialized round-trip. MCP was
treated as the security mechanism when it was only ever the transport. The actual boundary was
the token scoping, RLS, credential absence, and the validated write gate.

**The measured cost.** The clearest evidence the transcripts contain: when ADR-027 moved the
contract out of a per-run MCP fetch and into Hermes's `instructions` field (compiled, cached
prefix), runs went from 5 tool calls / 21s / $0.045 to 2-3 tool calls / 8-15s / ~$0.03. Removing
*one* MCP round-trip bought a 30-60% latency and cost win. Nobody generalized the finding to the
rest of the tool surface.

**Signals raised and not acted on.**
- June 11 (Codex design review): "keep Hermes as an adapter, not as the architecture." Noted,
  never operationalized.
- ADR-005 said MCP is the external connector only; ADR-025/026 landed the runtime on an internal
  MCP tool surface. The tension was flagged explicitly (June 14) and left unresolved.
- Hermes opens its MCP connection once at startup and never reconnects. An api restart
  permanently bricked the agent's tool access for that pod's lifetime. The fix was an
  initContainer band-aid, not a rethink of the coupling.
- `search_records` was a naive substring scan over ≤200 summaries, flagged as "not for a real
  book of business" (issue #36), and the alternative (a real read path for the agent) was never
  proposed because the MCP tool surface was the only access path considered.

**The corrected model** (already sketched in `diagrams1.md`, confirmed by the 6-18 and 6-22 Juno
calls): the control plane calls the **Hermes API server directly and privately**
(`POST /v1/runs`, `API_SERVER_KEY`, mTLS, SSE back). Hermes is private and reachable only from
the control plane; surfaces never touch it. MCP is at most an outward-facing surface (Claude
connector, Jarvis door), never internal plumbing. One seam is explicitly open and is the first
decision of the rebuild: **how the agent reaches data during a run — MCP tool callback to the
control plane, or tools bundled in the Hermes profile.** That choice sets latency, attack
surface, and how much of the write-gate design carries over.

---

## Flaw 2: Juno adopted before it was ready, and before we were

**How it got in.** ADR-017 was written within hours of Juno being mentioned, on the strength of
one meeting whose notes file was empty when a second thread reviewed it. The framing "the exact
missing layer we kept circling" preceded any deployment attempt. The portability guardrail
(plain containers, swappable platform) was the right condition and was stated in the ADR; it was
never exercised until the very end, and it is the only reason the archive was survivable.

**The pattern, across every Juno session.**
- Key features lived on unmerged branches (PR #557 runtime environments, `clusterip` mode);
  docs were enterprise-oriented and stale; the real answers required cloning their repos or
  talking to the team directly.
- Closed-source behaviors were only provable empirically on a live cluster: Terra's
  `plugins/`-root directory contract, `resource_id` must equal the directory name, field
  injection is flat top-level keys. ADR-038 §6 decided the repo layout without that proof and
  two structural PRs (#61, #62) were spent undoing it.
- Version drift bit repeatedly: Genesis pinned at v2.0.2 in their own test file when v5.1.0 was
  current; ArgoCD's `stable` tag jumped to v3.x mid-session and broke a script that worked an
  hour earlier.
- The June 18 onboarding call invalidated the whole track at once: Juno's runtime-environment
  model eliminates the container build; Alex explicitly advised **against** packaging Cormac as
  Juno plugins ("build it as an external app on EKS, use Juno for dev"); multi-arch is their
  problem. The multi-arch pipeline, Terra packaging, `push-arm64.sh`, and most of PR #63 were
  aimed at problems the platform intended to remove. Founder, on the record: "well, shit. we did
  a lot of work for nothing."
- June 22-29 hands-on on the real cluster: `/storage` not writable by workload users (the
  entire shared-storage dev loop dead), the template's persistence redirect pointing at an
  ephemeral `$HOME`, and the code-server proxy fighting Juno's auth wall so a web app could not
  be viewed at all. Three blocker-class bugs in one session, each needing vendor intervention.

**The verdict for v2.** Build locally on plain Kubernetes primitives that map 1:1 to EKS: the
kind rehearsal pattern (kind + ArgoCD + ingress-nginx + cert-manager + mkcert +
`*.localtest.me`), plain Helm charts, ESO + Infisical, managed Supabase, GHCR images. That is
exactly the stack that survives whether Juno matures or not. Adopt Juno as a substrate when it
can run the app without vendor hand-holding, not before.

---

## Flaw 3 (the quiet one): the keystone never got built

ADR-023 named the Workbook Contract Agent the keystone risk. It got three spikes (which honestly
surfaced the hard problem: real workbooks produced invalid, unstable contracts across runs, and
the two-phase consultative interview was designed in response) and **zero build**. The
operations agent got the knowledge layer, the cache work, the pane scaffold, the deployment
pipeline. The founder caught it himself: "everything is terminal... 90% updating, 10% authoring."
The session's own words: "the record is now more polished than the riskiest part of the build."

v2 rule: the authoring agent is built first or in parallel, never after infrastructure.

---

## What the thirteen days actually validated (carry these forward)

1. **Contract-first data model.** Founder-articulated against the agent's hardcoded-tables
   proposal on day one; it is the product. JSONB-hybrid storage with generated hot columns
   (ADR-019) proven against real Postgres.
2. **Control plane as the only writer**, proposal → confirmation → atomic apply → append-only
   audit. Proven live end to end, including cross-tenant isolation and the human-only gate.
3. **`submit_proposal` as a typed, schema-enforced write gate.** The ADR-025 resolution (agents
   run as real tool-users; schema enforcement lives at the tool-call argument layer, since the
   Hermes Runs API accepts no response_format) is the right write-gate shape regardless of
   transport.
4. **Memory off, governed typed learning.** External research and red-team data backed it
   (Hermes-with-memory-on: 66.7% attack success; consulting memory doubled attack success in
   Microsoft's study). Typed slots only (`alias` bound to a recordId with FK cascade,
   `enum_synonym`), no free-text, no auto-compaction ever, `precedent` rejected as "free-text
   memory wearing a typed hat." Filed as issue #35, designed, worth reimplementing as-is.
5. **Compiled, cached context prefix via the Hermes `instructions` seam.** The single
   highest-value technical finding of v0. Byte-stable deterministic prefix, `cache_ttl: 1h`,
   `pass_session_id` on. The measured win is above.
6. **The two-phase consultative authoring interview.** Free-form agent-led consultation with
   checkpoints (structure agreed → fill → review), not batched question rounds. The spike proved
   the elicitation reasoning is genuinely good; one-shot authoring is what fails.
7. **Excel task pane as primary surface** (ADR-028). The demographic lives in Excel; Office.js
   reads the open workbook during the interview (no upload step); Coefficient ($24.7M raised,
   same shape) proves the model. Verified platform facts: no save event in Office.js; NAA/SSO
   are Entra-only, with Entra as an upstream IdP feeding Supabase (`signInWithIdToken`) as the
   corrected auth design; Mac desktop Excel has no sideload UI (use the `wef` folder); the
   manifest pins the pane's domain near-permanently, so a stable domain + TLS is a deployment
   *prerequisite*, not a nice-to-have.
8. **The deployment substrate minus Juno.** Kind rehearsal script, plain Helm charts, ESO +
   Infisical (machine identity, `infisical run` for the developer plane), managed Supabase
   everywhere except hermetic CI, ES256/JWKS auth, multi-arch GHCR images. Also the operational
   scars: every ExternalSecret key must exist or the whole sync freezes silently (13 hours,
   once); helm lint/template proves nothing about running pods.
9. **Working machinery:** the GitHub tracker (Serenica-Digital/Cormac, Project #3), GHCR,
   Infisical project `cormac`, the eval harness with the anonymized real-workbook fixture, the
   `/digest` spine-projection technique (20-35x reduction, used to produce this document), and
   the ADR + control-register discipline (claim → code → test → status), which repeatedly caught
   real drift.

---

## Process pain points (these cost as much as the architecture did)

- **Adjacent work shipped as the deliverable.** The env/secrets saga is the canonical case:
  asked for consolidation (generate from one manifest, one secret authority), got detection
  (drift checks) three times before the real thing landed. Founder's phrase: "40% again."
  Related: guards added instead of root causes removed (`check:infisical`, the `posture` /
  `REMOTE_*` / `isGatedManaged` straddle that took three sessions to name and delete).
- **Docs aspiring ahead of code.** A client-facing security doc described a dead architecture;
  "logs are masked" was asserted with the masking helper applied nowhere; a doc refresh was
  once done by bumping dates without verification. ADRs decided things empirically falsifiable
  on a live cluster (ADR-038 §6) and were falsified. Rule for v2: ADRs mark decisions as
  *assumed* vs *proven*, and deployment claims require a running pod, not a rendered template.
- **Silent failures.** CI red since the first env commit and unnoticed for days (local "all
  green" ran a subset that excluded the pane tests); ESO frozen 13h with no alarm; three
  commits sitting unpushed while the PR looked current; `values.local.yaml` placeholders making
  `pnpm dev` silently broken; a stale port-forward causing a phantom 401.
- **Parallel-thread coordination costs.** The fork/executor/reviewer workflow caught real bugs
  (broken warm-cache proof, cross-object alias gap, NUL bytes making a file binary to git) but
  leaked: plan-file collisions, forks re-hedging already-settled facts (the ollama plugin,
  three times), memory not propagating across forks, handoffs buried mid-response.
- **One hour of primary-source contact beat weeks of inference.** Every major Juno correction
  came from a call or from cloning their repos, never from re-reading our own research docs.
  The founder's rejection of the docs-brain-preservation argument at archive time was the same
  point: the durable insight was in the transcripts, the docs recorded already-stale decisions.

---

## Where it landed (2026-07-07)

- `archive/` holds all of v0 at `95c65e3`; safety tags `v0`, `v0-main`, `v0-dev` on the remote.
- `v2-architecture/` holds the two corrected diagrams (`diagrams1.md`) and nothing else. No v2
  ADRs, no PRD, no code.
- The one explicitly open architectural seam: agent data access during a run — MCP tool
  callback to the control plane vs tools bundled in the Hermes profile. Decide first.
- Still-live infrastructure: GitHub tracker + Project #3, GHCR packages, Infisical project
  (`.infisical.json` is in `archive/`, needs re-establishing at root), managed Supabase.
- Unbuilt then, unbuilt now: the authoring agent, multi-turn conversation state, real record
  search, the pane GO/NO-GO measurements.

## The throughline

v0 died of two early, cheap-feeling commitments made on day one: a transport mistaken for a
trust boundary, and a platform adopted on the strength of a friendship and a single meeting.
Both were flagged in-flight (the adapter-not-architecture comment; the portability guardrail)
and neither flag changed behavior, because thirteen days of momentum kept converting flags into
issues and issues into backlog. Meanwhile the actual product risk, the authoring agent, was
spiked honestly and then starved while infrastructure ate every session. The founder's
corrections were the project's real review process, and they were right nearly every time:
against hardcoded tables, against thin ADRs, against runtime amputation, against detection
dressed as consolidation, against docs polished past the code. The rebuild's job is to make
those corrections structural instead of reactive: prove before deciding, build the keystone
first, keep the platform swappable in practice and not just in prose, and never confuse the
pipe with the boundary.
