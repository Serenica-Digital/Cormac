# ADR-013: Claude-first provider seam; three billing modes; not BYO-AI

**Status:** Accepted
**Date:** 2026-06-06
**Related:** The provider seam lives in ADR-006 (the runtime is already model-agnostic). The billing split depends on ADR-007 (thick MCP), the server-driven write loop it protects is ADR-005, and the compliance-envelope framing supports ADR-015 (security) and ADR-016 (market).

## Context

Three questions arrive bundled as "make it model-agnostic and let clients bring their own AI": should the backend be model-agnostic, should the product be an MCP server the client points their own AI at, and do clients want to bring a compliant AI plan. They have different answers, and untangling them is most of the value here. A common client objection sits on top of them: "we already pay through the nose for Claude seats, why can't this use those."

The objection rests on a false premise that has to be corrected cleanly. Claude seats are subscriptions to the chat product (claude.ai, Desktop, Team, Enterprise). They power a human sitting at Claude. They do not come with an API key a backend can bill against, and there is no mechanism for a third-party app to charge its API calls to a seat subscription. The Anthropic API is a separate billing relationship through the Console. So the seats and the thing our engine needs are two different products that share a brand, and even BYOK runs on a client's Console API billing, not on their seats.

The other false premise is the compliance one. The beachhead is Microsoft-heavy SMBs without dedicated IT (ADR-016). They do not have a procured, DPA-backed company AI plan to bring; that is an enterprise artifact. For that customer, us providing the AI is the feature, not a liability.

## Decision

Claude-first, tuned, behind a thin provider seam, with three billing modes, and BYO-AI is not the reasoning architecture.

### 1. Claude-first behind a seam, not true agnosticism in v1

Put the model behind a thin reasoning-provider interface so it can be swapped or added to later. Do not chase true model-agnosticism in v1. Accuracy is the product, and the Anthropic analytics lesson is that reliability comes from a governed layer, skills, and mapping tuned against a specific model's tool-use and prompt behavior. A lowest-common-denominator abstraction gives up exactly that tuning. Pick Claude as primary, tune hard to it, keep the seam so we are not locked in. Agnosticism is a tax paid later for up-market clients, not a v1 goal.

### 2. Three billing modes

| Mode | Who pays the API bill | Best for |
| --- | --- | --- |
| Platform-provided key, AI bundled | We pay Anthropic; the customer pays a predictable app price | The SMB default. Lowest friction, we stand behind compliance. |
| Bring-your-own-key | The customer's Anthropic API key; usage on their account | Technical, cost-conscious, or compliance-driven buyers. Offered day one, recommended where it fits, not the default. |
| Bring-your-own-endpoint / in-tenant | The customer's Azure OpenAI, Bedrock, or self-managed endpoint | Enterprise and regulated, later. |

### 3. BYO-AI is not the reasoning architecture

The headline feature is server-driven: a webhook fires, the backend runs the model, it writes, with no human at a Claude window in the loop. Making the client's generic Claude the reasoning engine would ship only the interactive read half (the part Attio's connector already does) and forfeit the prompt, skill, model-version, and eval control that is the product. The thick connector (ADR-007) is how a client's Claude still reaches our exact intelligence: their seats power the outer chat wrapper, our key or their BYOK key powers the reasoning inside our tools.

## Consequences

- The BYO-cost benefit is available through BYOK without becoming a thin MCP layer, so the cost motive hiding in "bring your own AI" is satisfied without giving up control of the reasoning. You do not need the BYO-AI architecture to get the BYO-cost outcome.
- For the SMB beachhead, the platform owning the AI relationship is a selling point. The client's compliance need is met by one trust packet from us, with the model vendor named as a subprocessor and the API's no-training-on-API-data and retention posture documented (ADR-015). We are the compliance envelope. BYOK relocates the model subprocessor but does not remove our compliance work, since their CRM data is in our Supabase either way.
- Owning the key lets us route routine work to a cheaper model, cache, and trim tokens, keeping cost of goods bounded, which the sub-$40 pricing constraint requires (ADR-016).

## Alternatives considered

**True model-agnosticism in v1.** Build to a cross-provider abstraction from the start. Rejected because it gives up the model-specific tuning that makes the write loop reliable, which is the whole accuracy story. The seam preserves the option without paying that tax now.

**MCP-first / BYO-AI as the core.** Make the client's Claude the brain and ship a thin MCP layer over the CRM. Rejected because it loses the server-driven write loop, surrenders the controls that produce accuracy, and commoditizes the product into the undifferentiated zone the market posture avoids (the client's Claude plus Attio's connector already does that).

**BYOK as the forced default.** Push every client to bring a key. Rejected because it taxes the non-technical SMB that is the beachhead: a separate Anthropic Console account (which surprises the "we already pay for Claude" buyer), billing setup, key handling, and the operational fragility of their key rotating or hitting a cap and silently killing the SMS loop on our support queue. BYOK is offered and sometimes recommended, never forced.

## Open items

1. **Structured-output path.** Standardize on a `complete_structured` skill versus instruct-and-parse for the proposal path (shared with ADR-006).
2. **In-tenant timing.** When the bring-your-own-endpoint mode is built, driven by the first regulated or large buyer (ADR-016 keeps those out of the early market).
3. **Model tiering.** Which work routes to a cheaper or faster model versus the strongest model, which is both an accuracy and a margin decision under the pricing constraint.
