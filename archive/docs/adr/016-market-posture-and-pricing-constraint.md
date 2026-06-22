# ADR-016: Market posture and the pricing constraint

**Status:** Accepted for the posture and the constraint; the actual price points are unsettled and open
**Date:** 2026-06-06
**Related:** Carries the commercial constraints named in ADR-001 (platform-first). It rests on the wedge that ADR-004 (Excel-native), ADR-010 (the SMS write loop), and ADR-002 (contract-first fit) create, on the billing modes of ADR-013, on the cost discipline of ADR-006 (stateless runtime), and on the compliance scoping of ADR-015. The sub-$40 constraint here is also the gate on whether the orchestration platform of ADR-017 can host production, not just the prototype.

## Context

A two-person product cannot win a feature war against Attio, Day.ai, HubSpot, or Salesforce. They are funded, polished, further along, and already AI-native with email sync and Claude connectors. Trying to be a better general AI CRM loses on day one, and that is the grave most vibe-coded SaaS digs: undifferentiated, no distribution, no trust, no retention. The honest framing is that for most generic CRM buyers the right advice is to go buy Attio or HubSpot. The product only wins in a narrow slice, so the slice has to be named and owned, and the customers outside it have to be turned down on purpose.

The real edges this product already has are worth stating plainly, because they are more than most vibe-coded SaaS has: a paying first customer, a domain-expert partner, a specific vertical, and a service relationship. The strategy is to compound those, not to pretend the code is the moat.

## Decision

Position as a wedge, sell service-led, pick a narrow market, and treat pricing as a hard constraint rather than a settled model.

### 1. The wedge has three legs the incumbents structurally will not lead with

- **SMS-first.** Text the CRM in plain language and it updates itself (ADR-010). The incumbents are app-and-email-first; none makes the text-message write loop the primary interaction.
- **Excel and Microsoft-native, meet-them-where-they-are.** The client's spreadsheet structure stays theirs and the system molds to it (ADR-002, ADR-004). The incumbents' whole business is getting customers off spreadsheets, so they cannot lead with this.
- **Vertical fit for relationship-deal shops.** Multi-counterparty deal structure (for example banker, facility, lender, with relationship cadence) does not sit cleanly in a generic pipeline CRM. Vertical SaaS wins on fit, not feature count.

The one-line pitch: it runs on the spreadsheets and texts you already use, it is set up for your exact deal workflow, and you own your data, so you are not learning Salesforce.

### 2. Service-led go-to-market

A productized service: done-for-you onboarding, migration, Microsoft and Twilio wiring, and agent tuning. The contract-first setup is developer-assisted anyway (ADR-002), so lean into it rather than fighting it. Land via the first design partner as a real reference, expand by referral inside the vertical, where these worlds are small and word travels. The moat that compounds is vertical workflow depth plus the customer relationship, not the technology.

### 3. The market, and who to say no to

Target financial-adjacent, relationship-heavy, Microsoft-heavy SMBs: real estate acquisition and development, private lenders, brokers, family offices, boutique deal shops, and professional-services business development. Say no to regulated institutions (banks, broker-dealers, RIAs handling regulated client records, healthcare, insurance, public-company compliance), to anyone wanting a zero-setup self-serve product, and to anyone large enough to have a real revenue-operations team. The earlier "no financial clients" line was an overcorrection; the precise rule is to avoid formally regulated buyers (the FTC Safeguards Rule and FINRA vendor expectations raise the bar sharply for those) while keeping financial-adjacent deal shops, which are the wedge. Saying no keeps the wedge sharp and keeps the product out of compliance scope it cannot yet carry (ADR-015).

### 4. Pricing is an open constraint, not a model

It must land at or under roughly $40 per seat-equivalent for the target SMB, or that customer is out of reach. For comparison, a small team on HubSpot Sales Hub Professional is often paying on the order of $90 to $100 per seat per month and climbing with add-ons, so a flat workspace fee can read as a deal while still covering cost. The working shape is a one-time setup fee plus a monthly workspace base (a small team and an AI and SMS allowance included) plus metered overage, with a managed single-tenant premium tier later, defaulting to bundled AI with BYOK as an option (ADR-013). Two traps to avoid: do not price cost-plus, because the AI leverage underprices the value, and do not sell unlimited AI on a flat plan, because that becomes a loss-making proxy the moment a heavy texter shows up.

## Consequences

- Product priorities favor setup quality, schema mapping, daily-capture reliability, and trust over broad CRM surface area. The roadmap optimizes for the wedge, not feature parity.
- Cost of goods must stay bounded, which is why AI and SMS usage is metered and why owning the model key matters (ADR-006, ADR-013). The sub-$40 constraint is a real design pressure on per-tenant compute and onboarding labor.
- The early market deliberately stays below the regulated-compliance threshold, which keeps the security packet at private-pilot scope rather than full certification (ADR-015).
- There is a genuine tension to manage: service-led gives high margin per client but spends the founders' time and does not scale, while product-led scales but needs self-service config and distribution, which is the larger lift where vibe-coded products die. The path is the middle: start productized service, use the revenue and learning to harden the self-service contract setup, and keep the architecture SaaS-ready so the option stays open without betting on scale before there is proof.

## Alternatives considered

**Compete head-on as a better general AI CRM.** Rejected because it loses immediately to funded incumbents with distribution and trust, and it is the exact undifferentiated grave to avoid.

**Pure product-led self-serve SaaS for v1.** Rejected because self-serve needs low-touch onboarding, self-service configuration, and distribution, the much larger lift. Start as a productized service and harden self-serve later, with the architecture already built SaaS-ready (contract-first, multi-tenant Supabase) so the option is preserved.

**Avoid all financial clients.** Rejected as too broad. Regulated institutions are out; financial-adjacent relationship and deal shops are the wedge, not a market to avoid.

## Open items

1. **Actual price points.** The setup fee, the workspace base, the included allowance, and the overage rates, validated against current competitor pricing before any of it reaches a client document. The numbers in this ADR are directional, not quotes.
2. **Design-partner pricing.** Discounted or founder-priced, but in writing and tied to the unresolved equity and IP terms (ADR-001), rather than given away for vague goodwill.
3. **The metered-cost model.** The per-interaction AI and SMS cost bands that keep gross margin positive under the sub-$40 constraint, which depends on model tiering (ADR-013).
4. **Production hosting cost.** Whether the orchestration platform's pricing (ADR-017) fits the sub-$40 constraint at production scale across many small tenants. This is the gate on Juno moving from prototype orchestration to production hosting, and it is unanswered.
