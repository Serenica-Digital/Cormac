# ADR-018: Repository structure and runtime stack

**Status:** Accepted
**Date:** 2026-06-07
**Related:** Turns the design ADRs into a buildable repository. It generalizes the monorepo decision of ADR-014 (Lovable owns `apps/web` as a package, not a submodule) into the whole layout, gives the control plane of ADR-005 and the runtime adapter of ADR-006 a physical home, and is the ground the storage choice of ADR-019, the auth verification of ADR-020, and the runtime-seam result of ADR-021 are built on. The conventions here are what a building agent (Jarvis or a contributor) follows so the invariants in [CLAUDE.md](../../CLAUDE.md) get implemented once, the same way.

## Context

The design ADRs name the parts (a Node/TypeScript control plane, Supabase, a Lovable web app, a Dockerized Hermes runtime) but not the shape of the repository that holds them, the language conventions, or the toolchain that builds and runs them. Left unwritten, every contributor reinvents that shape, and a product whose entire thesis is a set of enforced invariants cannot afford the trust boundary to be wired three different ways in three packages.

Phase 0 of the build plan had to make those choices concretely to stand up the walking skeleton, and the right move was to make them once, record them, and keep them boring. The forces:

- The trust boundary spans several services (control plane, worker, web, runtime) that share types (the contract meta-schema, the proposal shape, roles). A shared schema change has to update the API, the worker, and the UI together or the boundary drifts.
- The product is two people plus a development assistant, so the toolchain must minimize ceremony. A heavyweight build graph that has to be green before anything runs is friction with no payoff at prototype scale.
- The services have to stay portable containers (ADR-017): no framework or platform lock-in that a future move off Juno would have to unwind.

## Decision

A single pnpm monorepo of TypeScript packages, run directly with `tsx`, type-checked and tested as separate gates, with one validation library at every boundary.

### 1. Layout

A pnpm workspace over three globs: `apps/*`, `packages/*`, `services/*`.

| Path | Role |
| --- | --- |
| `apps/api` | The control plane (Fastify). The only writer (ADR-005). Owns auth verification, RBAC, the proposal pipeline, and the runtime adapter. |
| `apps/web` | The web surface. Hand-built minimal screens for the skeleton; Lovable owns this package later (ADR-014). |
| `apps/worker` | Background jobs: the weekly report (ADR-010) and connector processors. A stub for now. |
| `packages/contract` | The contract meta-schema and the validation that enforces it. This is the product IP (ADR-002); it has no dependency on the database or a server. |
| `packages/db` | The Supabase client factories (service, anon, user) and the app-owned row types. |
| `packages/shared` | Roles, capabilities, the confirmation mode, and the typed error. |
| `services/runtime-stub` | A dependency-light stand-in for the Hermes runtime over its HTTP contract (ADR-021). Separate from `apps`/`packages` to keep the boundary honest: it holds no database access. |
| `supabase/migrations` | The app-owned schema, RLS, and the append-only audit trigger, versioned in the same repo. |
| `docker/` | A Dockerfile per service plus a local compose, the shape handed to Juno (ADR-017). |

Business objects never get a package or a table; they are contract-defined data (ADR-002, ADR-019). The packages above are all operational.

### 2. Language and module conventions

TypeScript everywhere, ESM with `NodeNext` resolution, strict mode with `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch` on. Cross-package references use workspace dependencies whose `exports` point at the package source, with TypeScript `paths` so the type-checker resolves `@serenica/*` to `packages/*/src`. A shared schema change is therefore one commit that the API, worker, and web all pick up, which is the co-evolution benefit ADR-014 chose the monorepo for.

### 3. Run via `tsx`, type-check as a separate gate, no compile step for the skeleton

Node services run their TypeScript directly with `tsx` (`tsx src/index.ts`) in development and in their containers. There is no per-package `tsc` build producing JavaScript. Correctness is enforced by two independent gates instead:

- **Type safety:** one `tsc --noEmit` pass over the whole Node side (a root `tsconfig.json` including `packages`, `apps/api`, `apps/worker`, `services`, `scripts`, and `tests`), plus the web app's own `tsc --noEmit` (which needs DOM, JSX, and bundler resolution). The web app builds for production through Vite.
- **Behavior:** Vitest, including the live cross-tenant isolation test (ADR-019, ADR-015).

The reasoning: a cross-package `tsc` build graph (composite projects, declaration emit, build ordering) is real friction that buys nothing at prototype scale, where `tsx` runs the same source the type-checker checks. Production hardening (a compiled or bundled artifact) is a later call, recorded as open, not a thing the skeleton pays for now.

### 4. One validation library at every boundary

Zod is the single validation library: the contract meta-schema and proposal shapes (`packages/contract`), the control-plane environment config, and every request body. "Validate at the boundary with Zod, treat everything outside as untrusted" is the discipline ADR-005 and ADR-006 depend on, and using one library for all of it keeps that discipline legible.

### 5. Tooling

pnpm 10, Node 22. ESLint flat config with `typescript-eslint`, Prettier for formatting. Vitest for tests. Fastify for the control-plane HTTP layer. These are defaults chosen for low ceremony and good TypeScript ergonomics, not deep bets; the Fastify choice in particular is reversible (see Alternatives).

## Consequences

### Operational

- One install, one lockfile, one set of conventions. A contributor or Jarvis reads this ADR and knows where a thing goes and how to run it. CI is a flat sequence: install, lint, type-check, build, then the security and test gates.
- Running `tsx` in containers means the production image is the source plus `node_modules`, with no build artifact to manage. Simple now; the open item below is whether production wants a compiled, slimmer artifact.

### Architectural

- The dependency direction is enforced by the layout: `packages/contract` knows nothing of the database or HTTP, so the IP that defines and validates contracts is reusable and testable in isolation (its unit tests need no server and no Postgres). `apps/api` is the only package that imports the service-role client.
- The `services/runtime-stub` separation keeps the runtime boundary visible in the repository shape itself: it is not an app and not a shared package, and it has no path to the database.

### Risk accepted

- "No build step" trades a production-grade artifact for prototype velocity. The bet is that the type-check and test gates give equivalent safety, and that compiling or bundling is a cheap, contained addition when production needs it. If a dependency ships ESM/CJS interop problems that only surface at runtime, the gates will not catch them; that is the cost.

## Alternatives considered

**Nx or Turborepo.** Task orchestration, caching, and graph awareness. Set aside because pnpm workspace scripts cover the current size, and the caching payoff arrives only when build and test times grow. Revisited when they do.

**A per-package `tsc` build graph (composite projects, emit to `dist`).** The conventional "correct" monorepo build. Rejected for the skeleton because it forces a build-before-run ordering and declaration plumbing for no benefit when `tsx` runs the checked source directly. It becomes attractive only alongside a real production-artifact decision.

**Polyrepo, or a submodule for the web app.** Rejected on the same co-evolution grounds as ADR-014: splitting the shared contract and Zod types across repos makes a schema change a multi-repo dance for no gain before any package is independently deployed or team-owned.

**Express instead of Fastify.** Workable. Fastify is chosen for its first-class schema/validation hooks, speed, and TypeScript ergonomics, but this is a low-stakes, reversible default; Hono is the other obvious option. None of the trust logic depends on the framework.

## Open items

1. **Production build and packaging.** Whether production compiles or bundles the Node services (smaller images, faster cold start, no `tsx` at runtime) or keeps running `tsx`. A contained, later decision, gated on real deployment needs (ADR-017).
2. **Build orchestration at scale.** Whether to adopt Turborepo or Nx caching when build and test times justify it.
3. **API framework.** Fastify is a reversible default; revisit only if a concrete need (a specific plugin ecosystem, edge runtime) argues otherwise.
