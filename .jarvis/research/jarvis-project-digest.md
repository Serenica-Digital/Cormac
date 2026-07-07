# Jarvis project digest: the sibling system, its final shape, and the owner's specifications

Digest of all 9 sessions from /Users/patrickmikes/Desktop/Jarvis (2026-06-17 → 2026-07-07,
~3.2M raw tokens projected to a ~108k spine, read in full). Written 2026-07-07 as the companion
to `v0-retrospective.md`. Two lenses, per the ask: the structure Jarvis actually arrived at, and
the specifications Patrick gave along the way for the shape he wants. The last section is what
this means for Cormac.

---

## The arc in one paragraph

June 17: a scouting session rejects Crest (an orchestration GUI, "more trouble than it's worth")
and lands on Nous Hermes as the substrate for a cross-project PM agent, with two articles
(Attio's Universal Context, Anthropic's self-service analytics) supplying the load-bearing
framing: what's being built is a governed semantic layer for coding projects, not a bot. June 20,
one long session plus three parallel forks: greenfield v2 build after a "slop-filled" v1 was
archived as poisoned. The distribution is built, dogfooded on its own repo, smoke-tested,
board-reset; the first live headless review exposes two real bugs; a golden-scenario harness is
built to catch them; a digest regression (reinvention instead of reuse) is caught and fixed; the
Claude Code companion plugin ships. June 20-21, the pivotal fork: the transport spike overturns
ADR-0005 — `hermes mcp serve` is a messaging bridge that never runs the agent loop; the real
channel is the gateway's OpenAI-compatible API server. Live approval round-trips are proven both
ways. June 21 → July 7: close-out — review folds into consult, the approvals timeout ships as a
distribution default, secrets get hardened, and the system goes quiet because it works (this
CRM-Agent session invoked `jarvis:digest` through that plugin today).

---

## The final structure (what Jarvis is now)

**One repo that IS the product.** The Jarvis repo is a Hermes **profile distribution**
(ADR-0001): `distribution.yaml` (manifest, `env_requires` → generated `.env.EXAMPLE`),
`SOUL.md` (PM identity + authority boundaries only), `config.yaml` (model/terminal/delegation/
approvals defaults, `approvals.timeout: 1800` shipped), `mcp.json`, and `skills/`. Installed
with `hermes profile install <repo>`. No separate CLI — deterministic logic lives as
stdlib-only Python/bash scripts **inside** the skills (ADR-0002).

**Seven distribution skills**, each cognition + bundled deterministic scripts:
- `project-init` — stamps the `.jarvis/` contract into a managed repo (scaffold.py, idempotent)
- `transcript-digest` — `discover_transcripts.py` (find + copy + checkpoint, Claude store by
  encoded-cwd, Codex by content match, `index.json` ledger with
  `unreviewed/reviewed/stale`) + `project_transcript.py` (full-arc spine, bounded per message,
  multi-file, `--since-line` incremental; ADR-0010)
- `orient` — PRD → accepted ADRs → handoff, research excluded; the shared protocol for coders
  AND Jarvis (ADR-0008)
- `pm-review` — orient → digest → route → Authority Routing Audit → `validate_report.py`
  (deterministic floor) → report + handoff
- `knowledge-routing` — the 8-lane altitude tests (PRD / ADR / architecture / research /
  GitHub / runbook / ignored / memory)
- `github-planning` — declarative JSON plan → `validate_plan.py` (fixed action allowlist, no
  arbitrary gh) → `apply_plan.py` (dry-run default, `--confirm` to mutate)
- `consult` — `hub.sh` (run/status/setup the gateway + API server) + `consult.sh` (POST
  `/v1/responses` with a project-named conversation, print the reply, `--show-artifact` to
  surface any report the run wrote)

**The per-project shared surface: the `.jarvis/` contract** (ADR-0006). This and its
tracked/gitignored split are the load-bearing design decisions — the shared working surface for
Claude Code, Codex, Jarvis, and the developer, over the same files. Verified from disk
2026-07-07 (both Jarvis's own dogfooded tree and the `project-init` template stamped into
managed repos):

```
<repo>/
├── .hermes.md                  TRACKED   Jarvis's project-local context (Hermes context file)
├── AGENTS.md                   TRACKED   portable entrypoint for any coding agent
├── .gitignore                  TRACKED   scaffold appends one rule: `.jarvis/tmp/`
└── .jarvis/
    ├── prd/                    TRACKED   current truth ("the living state of the project")
    │   ├── README.md                     the lane's contract
    │   ├── executive-summary.md          what this is
    │   ├── requirements.md               durable outcomes + constraints to preserve
    │   └── architecture.md               how it is built NOW
    ├── adr/                    TRACKED   settled forks; numbered, never deleted;
    │   └── README.md + NNNN-*.md         supersede/amend, don't edit history
    ├── research/               TRACKED   reusable topic knowledge, organized by
    │   └── README.md + <topic>.md        technology/domain not by session; pulled on
    │                                     demand during work, never read at orientation
    └── tmp/                    IGNORED   runtime evidence/scratch — never project truth
        ├── README.md                     (the one tmp file that ships via template)
        ├── handoff.md                    rolling operational-continuity record: written at
        │                                 review end, read FIRST by the next orient;
        │                                 machine-local, deliberately not pushed
        ├── transcripts/                  raw session copies (claude-*.jsonl, codex-*.jsonl),
        │                                 projected *.spine.md, index.json checkpoint ledger
        │                                 (source_lines/reviewed_lines/status), latest.json
        ├── notes/                        review reports, spike findings, scratch
        ├── plans/                        draft guarded github-planning JSON (pre-apply)
        └── graphify/                     graph output
```

The split, as a rule: **tracked `.jarvis/` = what's decided; `tmp/` = what's happening.**
Everything a mutating stage produces (validated reports, handoffs, spines, draft plans) lands in
`tmp/` first; only the approved apply step promotes content into the tracked lanes or GitHub.
The template's own words: tmp "is part of the standard project contract, but it is not durable
project memory... the entire folder is gitignored and not regarded as a primary source of
project truth."

Three deliberate consequences of the split:
- **The read-only/mutating seam is enforced by the filesystem**: review stages may write freely
  because they can only touch ignored paths; git diff of tracked paths is the audit of apply.
- **handoff.md being gitignored is a choice, not an accident**: it's machine-local continuity
  shared across parallel local sessions via the filesystem, explicitly NOT durable truth — the
  gap a future shared memory provider would close (ADR-0009). Its known hazard: single-file
  state that parallel sessions can clobber, and the contamination vector if a review writes
  false beliefs into it.
- **One known tension left open**: the transcript ledger (`index.json`) lives in ignored tmp/,
  which is what let the first live review dismiss it as "old cruft"; Jarvis issue #17 proposes
  promoting the ledger to a tracked, schema-validated entity while the raw `.jsonl` bodies stay
  ignored (they embed absolute local paths and are machine-local by nature). The scenarios/
  harness already models this split: fixture ledgers/prompts/rubrics tracked, raw `.jsonl`
  bodies ignored.

Also in the repo-level split (Jarvis's own .gitignore): `archive/` (poisoned v1) never tracked;
`scenarios/.runs/` (disposable sandboxes) ignored; `scenarios/*/state/.jarvis/tmp/transcripts/*.jsonl`
ignored while the rest of each frozen scenario state is tracked.

Canonical truth in repo + GitHub, never in Hermes memory (ADR-0004, scoped by 0009). GitHub
holds execution state (issues, board #6); the repo holds knowledge.

**The Claude Code companion: a plugin, not commands, not subskills** (ADR-0011).
`.claude/plugins/jarvis/` with `orient`, `digest`, `save-transcript`, `consult` skills —
namespaced `/jarvis:*`, each a thin mirror that calls the distribution's scripts via
`${CLAUDE_PROJECT_DIR}`. Platform facts that forced this shape: skills are atomic (no
hierarchy); a plugin is the canonical grouped family; `extraKnownMarketplaces.source` is an
object with a relative directory path.

**Transport (ADR-0005, Accepted after live spike): the gateway's OpenAI-compatible API server.**
`hermes -p jarvis gateway` runs the persistent agent loop and (opt-in) hosts an API server on
`127.0.0.1:8642`. Coding sessions drive it with `POST /v1/responses` + a project-named
`conversation` (server-side state, prefix-cache-friendly); long work via async
`POST /v1/runs` → `/v1/runs/{id}/events` SSE (tokens, tool starts, `approval.request` with
command/description/choices) → `POST /v1/runs/{id}/approval`
(`{"choice":"once|session|always|deny"}`). `hermes mcp serve` is a messaging-platform bridge
that does NOT run the agent loop — demoted to optional notifications. Operational gates learned
live: API server needs `API_SERVER_ENABLED=true` + `API_SERVER_KEY` in the profile `.env`
(chmod 600); `terminal` is off for the `api_server` platform until
`hermes tools enable terminal --platform api_server`; `approvals.timeout` default 60s is
keystroke-paced and auto-denies — shipped at 1800s for human-paced approval.

**Two-layer memory (ADR-0009).** Canonical truth = what's decided (repo + GitHub). Hot/
operational = where we are (handoff.md, Hermes MEMORY.md/USER.md, FTS5 session search), with a
named pluggable seam (`orientation-read`, `recall-query`, `continuity-write`) so Mnemosyne or a
peer can drop in later. Mnemosyne judged no-go until a concrete recall failure names the need.
Conduct/behavioral observations route to hot memory as *generalized principles*, never into
project truth.

**QA (ADR-0012): golden-scenario replay.** A scenario = frozen `.jarvis/` state + prompt +
rubric under `scenarios/`; `run-scenario.sh` copies state into a sandbox under
`scenarios/.runs/`, provisions a throwaway profile, launches the agent **from** the sandbox
(process cwd is the isolation seam — `terminal.cwd` only steers the bash tool), and surfaces
the whole run for the human to judge; `validate_report.py` is a floor, not a grade. Rejected:
VCR/cassette replay, LLM-judge gating, eval frameworks, Hermes self-evolution — all
overengineered for the stage.

**The workflow loop** (the organizing seam is read-only vs mutating):
signal (manual, or a coding session saving its transcript) → delta from the ledger →
deterministic projection to spine → orient → model digest (arc + throughline) + routing plan at
altitude → **surface to the user inside Claude Code** for approve-or-greenlight → gated apply
(repo edits + guarded github-planning). The autonomy dial sits on exactly one stage (apply) and
is Hermes-native approvals, not custom config.

---

## The specifications Patrick gave along the way (the shape he's building toward)

These are the corrections and rulings from the transcripts, in his framing. They are the spec.

1. **It's a universal context layer, not a PM bot.** The Attio/Anthropic articles were the
   frame: collapse ambiguity before the agent searches. The docs ARE the product; `/digest` is
   the write path, `/onboard`/orient is the read path — "a thin wrapper pointing the fresh
   session to read the knowledge layer a certain way." Quality bar: a fresh session loads a
   handful of files and operates without re-deriving anything already settled.
2. **Manual-first, always.** "I don't want it to run on a transcript until I tell it to." No
   gateway, no cron until chosen. Later refined: the read-only stages may run freely; the
   autonomy question exists only at apply, as approve vs greenlight.
3. **The six-stage loop, dictated verbatim** (the "million dollar question"): get signal from
   Codex/Claude (with manual override for specific sessions) → identify the delta → project to
   a narrative spine → read the knowledge-layer contract to know the intended shape → produce
   (1) a thorough summary of what happened and (2) a plan of specific ADR/PRD/board updates
   "following the system and at the appropriate altitude" → surface to the user in Claude Code
   to approve or greenlight.
4. **"Claude Code/Codex is where I live."** There is no separate Jarvis surface. Jarvis reaches
   the human inside whatever coding session they're in. The assistant's "Jarvis asks you, not
   the coders" split was rejected as incoherent.
5. **"I run parallel sessions all the time."** Concurrent multi-client is the baseline, not
   deferred YAGNI. Topology: Jarvis is a persistent hub; every coding session is a concurrent
   client; parallel sessions coordinate through Jarvis + the repo as shared truth.
6. **Jarvis orients before it reviews.** It cannot read a transcript blind; it must know the
   current PRD/ADRs to know whether a fact is new, an edit, or already settled. Same protocol
   the human runs by hand on a fresh session — one shared contract, not Jarvis-private.
7. **Transcripts are first-class tracked entities.** A ledger with enforced schema, not
   gitignored scratch the agent can dismiss as "old cruft." (Born from the contamination bug:
   the agent let v1 transcript content override what it could directly read in the current
   file.)
8. **Reuse, don't reinvent.** The digest incident: the assistant rebuilt projection from scratch
   and regressed it (total cap + middle elision vs the proven full-arc per-message bounding).
   "Did you actually look at the earlier version we've been using?" The correct design merged
   the proven projection with the new checkpoint/Codex layers. This rule is now structural
   (ADR-0002/0011: one source of truth, wrappers call the canonical scripts).
9. **Minimal, standard, not overengineered.** Rejected in one exchange: provider-coupled VCR
   cassettes and eval pyramids — "I just need a standard way to do: feed Jarvis this transcript
   from this state, and see how he does." Also rejected: Hermes self-evolution (optimizing
   noise before a baseline exists), Mnemosyne-now, a custom `apply.mode` flag when Hermes
   approvals already exist.
10. **Platform answers come from the platform.** "There should be a standard best practice you
    should be figuring out" — repeated demands to research docs/Context7/source instead of
    theorizing (the transport truth was found only this way), balanced by "the docs are silent
    on X, so source is the authority there."
11. **Big decisions get ADRs; don't under-route.** "Deciding not to write a single ADR is not a
    success — we made some pretty major decisions." The testing approach, the plugin shape, the
    transport: all forced into the record when the agent (or Jarvis itself) filed them too low.
12. **Don't revert working state to satisfy a "clean" ideal.** The terminal-enable revert after
    a successful test: "the test fucking worked, why would I want you to revert it and then
    rebuild it."
13. **Conduct meta-analysis is hot memory, not project truth — and generalize it.** Over-sharp
    counter-example rules ("don't revert working state", "docs before source") are "anecdotes
    wearing principles' clothing" that misfire on the next case. Lift them to the one principle
    they share; store the generalized form in the feedback/memory layer; keep the repo's truth
    gates closed to it.
14. **One door, show the work.** "If the review is already generated, why do we need a whole
    separate skill? I always want to see it when I run consult." Review = consult with a
    review-shaped prompt + surface the artifact. And the two "ask the user" moments must not be
    conflated: the *soft* checkpoint (here's the report, review it) is the review's output; the
    *hard* approval gate belongs to apply only — a review-only run should trip no approvals.
15. **Human-paced gates.** A 60s approval window makes the primary safety control unusable
    theater ("Jarvis randomly bails"). Security dial (`mode`) and usability dial (`timeout`)
    are different things; lengthening the timeout weakens nothing.

---

## Bugs and findings worth remembering (proven, not theorized)

- **Wrong-session selection → contaminated handoff** — the first live review's cascade; the
  worst failure class for a PM agent because the handoff propagates the false belief into the
  next orient. Fix direction: deterministic report headers from `index.json`; "current files
  beat evidence"; the tracked ledger (#17).
- **Sandbox isolation seam** — `terminal.cwd` steers only the bash tool; the file tool resolves
  against process cwd. Launch the agent *from* the sandbox.
- **Hermes `write_file` sensitive-path guard** — refuses `/private/var/` (= macOS `$TMPDIR`);
  sandboxes live under the repo (`scenarios/.runs/`).
- **Approval visibility** — the command/description/choices ride the `/events` SSE stream, not
  the run-status endpoint; poll status and you blind yourself.
- **Docs-vs-reality gaps Hermes-side** — docs say approval body `{"decision"}`, reality is
  `{"choice"}`; `gateway run` does not auto-start the API server; the approval event shape and
  whether MCP `permissions_respond` unblocks a live run are undocumented (source says the MCP
  path is a best-effort SQLite poller — not wired to live API runs).
- **The agent's judgment layer is real** — Jarvis twice refused `rm -rf` framed as an
  "authorized test" as social engineering; legitimate task framing was required to even reach
  the gate.

---

## What this means for Cormac (fold-in to v0-retrospective.md)

1. **The v2 transport is already proven, in production form, in the sibling repo.** Everything
   `diagrams1.md` (now `.jarvis/prd/architecture.md`) sketches as "control plane calls Hermes API server privately" was stood up
   live in Jarvis on 2026-06-20/21: gateway + API server, `POST /v1/responses` with named
   conversations (server-side state = the compiled-prefix caching story), async runs + SSE +
   approvals endpoint, bearer-key auth on loopback. Cormac's control plane is "a client of a
   Hermes profile's API server" — the same integration `consult.sh` already implements.
2. **The open seam gets sharper.** v0's `submit_proposal` write gate can survive as a
   *tool* the agent calls, but the per-platform toolset facts (terminal off by default on
   `api_server`; toolsets configured per platform) and the Jarvis experience suggest the clean
   Cormac shape is: control plane → `/v1/runs`, agent's tools bundled in the profile (or a
   minimal callback), approvals surfaced to the human through the product's own UI via the
   `/approval` endpoint. The consult-vs-apply privilege split (read-only hub without terminal
   vs gated apply) filed as Jarvis #19 is the same shape as Cormac's operations-vs-authoring
   privilege question.
3. **The operational gotchas transfer verbatim:** `API_SERVER_ENABLED`/`API_SERVER_KEY` in env
   (ESO/Infisical for Cormac), `approvals.timeout` human-paced, SSE as the observability
   surface, `hermes tools enable ... --platform api_server` as a deploy step, profile `.env`
   chmod 600.
4. **The knowledge/process layer is shared infrastructure now.** The `.jarvis/` contract, the
   plugin (`orient`/`digest`/`save-transcript`/`consult`), the ledger, and the golden-scenario
   harness pattern are project-agnostic. CRM-Agent already has a live `.jarvis/tmp` ledger as
   of today's digest. Adopting `project-init` here (PRD + ADRs at root for the rebuild) is the
   natural next step, and the scenario-replay pattern is exactly how Cormac's authoring-agent
   evals should run (frozen workbook fixture + prompt + human-judged run — the v0 eval harness
   reborn).
5. **The same failure modes will stalk Cormac's agent.** Wrong-evidence selection and
   evidence-overriding-current-state are the PM-agent versions of what a CRM operations agent
   will do to business records. Jarvis's mitigations (orient first, deterministic headers from
   the ledger, current files beat evidence, typed gates, validated reports) are the same
   discipline Cormac's proposal pipeline encodes. One system, two products.
