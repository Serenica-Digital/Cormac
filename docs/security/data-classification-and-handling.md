# Data Classification and Handling

Status: drafted
Maps to: control-register rows 1, 6, 13
Last reviewed: 2026-06-06

The product is contract-first and data-agnostic. Business objects come from each tenant's published contract, not a fixed product schema, so there is no single data inventory to classify once. Classification is therefore a property of the contract, applied uniformly by the platform to whatever a tenant stores. This is how the system is built for compliance generically rather than for one assumed dataset.

## Classification lives in the contract

Each field in a published contract carries flags that drive handling:

- **`sensitive`** — the field holds data that must be minimized and masked. Sensitive values are never sent to the model context and are masked in logs (enforced; see below).
- **`editableByAgent`** — whether the agent may ever propose a value for this field. Human-only fields are rejected if the agent proposes them.
- **`editableByUser`** — whether users may edit it through surfaces.

Because these are contract properties, a tenant that brings financing terms, identifiers, or any other sensitive field classifies them once in their contract and the platform handles them correctly everywhere, with no per-dataset code.

## Uniform handling rules

| Rule | Applies to | Enforced by |
| --- | --- | --- |
| Stored under tenant isolation | all fields | RLS + `workspace_id` ([tenant-isolation.md](tenant-isolation.md)) |
| Never sent to the model context | `sensitive` fields | `buildContextDisplay` ([redact.ts](../../packages/contract/src/redact.ts)) |
| Masked wherever logged | `sensitive` fields | `redactSensitive` helper |
| Agent may not write | `editableByAgent: false` | contract validation ([validate.ts](../../packages/contract/src/validate.ts)) |
| Recorded with before/after in audit | all changes | [audit-logging.md](audit-logging.md) |

Proven in [redact.test.ts](../../packages/contract/src/redact.test.ts) and [validate.test.ts](../../packages/contract/src/validate.test.ts).

## The market guardrail keeps the bar private-pilot

The platform can technically hold sensitive data, but the commercial posture (ADR-016) keeps formally-regulated buyers (banks, broker-dealers, RIAs handling regulated records, healthcare, insurance) out of scope. That is what keeps regimes like GLBA and HIPAA from attaching and holds the compliance bar at a private-pilot packet plus enforced baseline controls. Onboarding qualifies buyers against this line.

## Open decisions

- **Default classification guidance.** Onboarding should flag obvious-PII and financial fields as `sensitive` by default during contract authoring, rather than leaving it to the client. This guidance is not yet built into the authoring flow.
- **Regulated-field refusal.** Whether the product should actively refuse or specially-gate fields that imply regulated data (e.g., full SSNs), rather than relying only on buyer qualification.
- **Data scope per pilot.** What a given pilot's contract actually contains is set at contract publish time; record it per tenant rather than assuming a global inventory.
