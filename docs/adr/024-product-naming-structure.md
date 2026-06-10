# ADR-024: Naming structure: Serenica the company and platform, Walden the working product name

**Status:** Accepted (Walden is a working name; the final commercial name requires clearance)
**Date:** 2026-06-10
**Related:** ADR-001 (the product placeholder "Serenica CRM Agent" dates from the founding decision), ADR-016 (market posture; the name ends up in the pitch, the A2P campaign registration, and client conversations), ADR-017 (the precedent for strict naming discipline: Jarvis versus the Hermes product runtime), ADR-015 (the security packet carries the formal name).

## Context

Since ADR-001 the product has been called "Serenica CRM Agent," with CLAUDE.md noting Serenica is the company. In practice one word was doing triple duty: the company, the multi-tenant platform, and the product. That blur surfaced while writing the Juno pilot documents, where "Serenica" had to mean a different thing per paragraph. This project has already paid once for name blur (the Jarvis versus Hermes confusion ADR-017 exists to prevent), so the layers get fixed now.

The product name carries unusual weight here because SMS is the headline surface: the name is what a client saves as a contact in their phone and texts after a meeting. That argues for a short, persona-capable name, and it is also why the name appears in formal artifacts early (the A2P 10DLC campaign registration, the security packet, eventually the MCP connector listing).

A first candidate, **Carmen**, was selected and then killed by a knockout search on 2026-06-10. The USPTO export showed a live intent-to-use application for the identical wordmark CARMEN (serial 99043261, Phoenix Rising AI LLC, filed 2025-02-16) covering AI chatbot software in classes 9 and 42, and a live in-use registration application for ASK CARMEN in class 42. Decisively, Phoenix Rising's Carmen is a shipped product: an AI agent working leads over phone, SMS, and email that writes lead statuses and notes directly into CRMs. Identical name, near-identical product category, senior on every axis. The same exercise established that warm human first names are a heavily mined namespace among AI assistant products generally (Carmen, Clara, Cara, Cora, Piper, Amelia, Dex are all taken by AI or CRM products), so each future candidate of that shape must be presumed conflicted until searched. A second candidate, **Cermit/CRMit**, came back clean on an exact-string search but is phonetically identical to a famous entertainment mark, which raises a dilution question that only an attorney consult can settle; it is deferred, not cleared.

The Phoenix Rising finding doubles as market intelligence: a funded company independently chose an SMS-first AI agent that updates CRMs as its product, which validates the product thesis and is tracked separately in competitive research.

## Decision

### 1. Three naming layers, one name per thing

- **Serenica** is the company, and the brand of the multi-tenant platform: the control plane, the trust layer, the thing a client's IT department evaluates. Formal artifacts (contracts, the security packet, the A2P registration, invoices) say Serenica until a final product name is cleared.
- **Walden** is the working name of the product: the client-facing agent a workspace's users talk to over web, SMS, and email. Working name means it is used freely in docs, code, and conversation, and is not yet committed commercially.
- The internal agent roles keep their descriptive names (the Workbook Contract Agent and the CRM Operations Agent, ADR-008), and the development tooling keeps Jarvis (ADR-017). Role names are never client-facing brands.

### 2. The bar a final name must clear

Before any candidate (Walden included) becomes the committed commercial name: a USPTO knockout search in classes 9, 35, and 42 including phonetic equivalents, not just exact strings; a product-market scan (app stores, Product Hunt, the AI-assistant namespace); a domain check; and roughly an hour of trademark counsel. Until then the name stays off formal artifacts.

### 3. No mass rename yet

Committed docs keep "Serenica CRM Agent" where it already appears; new writing may use Walden with "(working name)" on first use where the audience is external. The repo-wide rename happens once, when the final name clears, not per candidate.

## Consequences

- CLAUDE.md's vocabulary block is updated to carry the three layers.
- The Carmen evidence is preserved here and in the trademark export in the private notes, so the diligence is not repeated.
- Naming discipline now has two recorded precedents (ADR-017 and this one): one name per thing, and the name of a thing never migrates informally.

## Alternatives considered

**Carmen.** The preferred candidate on persona grounds. Rejected on the knockout evidence above: identical live senior mark on a functionally overlapping AI product. Not a close call.

**Cermit / CRMit.** Memorable, and "just CRM it" is a genuinely strong verb tagline that survives independently of the name. Deferred rather than rejected: the exact-string search is clean, but the phonetic identity with a famous mark poses a dilution question requiring counsel, and CRMIT Solutions appears to exist as a CRM consultancy. The tagline is kept as an option under any name.

**Tally, Tab, Clark, Booker and the hidden-job-name family.** Tally collides with Tally Solutions (accounting software). The others remain unsearched bench candidates.

**Nica / Sera (coined from Serenica).** Most clearable and structurally tidy. Rejected on taste by the founder, which is the controlling vote on a brand name.

**Persona-only posture (market as Serenica, name the agent informally).** Workable and low-risk, and partially retained (formal artifacts say Serenica). Rejected as the whole answer because it forbids ever putting the agent's name in the marketing spotlight, which is exactly where an SMS-first product's name wants to live.

## Open items

1. **The final name.** Walden graduates, or a successor candidate does, only by clearing the section 2 bar.
2. **Product name versus persona.** Whether the cleared name is both the formal product name and the texting persona (preferred: one name, one thing) or the persona only.
3. **Walden clearance.** Known same-name entities in other fields (Walden University, Walden Pond, various funds) are likely coexistence noise for classes 9/42, but that is a presumption, not a search result.
