# PRD Contract

This folder contains current project truth.

PRD files are living documents. Update them when project truth changes.

## Standard Files

- `executive-summary.md`: what this project is, who it is for, why it exists, current stage, and highest-level shape.
- `requirements.md`: outcomes and constraints future work must preserve from the product, user, business, or project-management point of view.
- `architecture.md`: how the current system is structured and which implementation mechanisms satisfy the requirements.

## Rules

- Keep PRD content current, concise, and unambiguous.
- Do not use PRD files as session notes.
- If an ADR changes current project truth, update the relevant PRD file.
- If docs and implementation disagree, surface the conflict.
- Preserve implementation mechanisms in PRD only when they carry project authority. A mechanism carries authority when future work must preserve its outcome, respect a settled tradeoff, or avoid a known risky invariant.
- Put ordinary implementation details, APIs, file paths, constants, and workaround mechanics in `architecture.md` or `research/`, not in `executive-summary.md` or `requirements.md`.
- If a requirement depends on an implementation detail, state the requirement as the durable outcome and point to `architecture.md` for the current mechanism.
- If a PRD constraint is really a settled fork with rejected alternatives, record or reference an ADR.
- Avoid duplicating the same fact across PRD files. Put it at the highest valid authority level and reference it only when needed.

## Routing Tests

Use these tests before writing:

- Executive summary: would a stakeholder or fresh agent need this to understand the project without opening code?
- Requirements: would changing this violate user intent, product correctness, business constraints, or project-management policy?
- Architecture: does this explain how the current system satisfies the project contract or why a future implementer should be careful?
