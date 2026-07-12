# 0013 — SMS is a core beta surface, not a deferred later door

- **Status:** Accepted (2026-07-12)
- **Amends:** the `.jarvis/prd/requirements.md` posture that "SMS is field capture" treated
  as a later door, and the open question "A2P 10DLC registration timing"
- **Builds on:** ADR-0010 (web is the first surface; this does not put SMS ahead of web),
  the "one agent service, many doors" invariant (`requirements.md`)

## Context

Direction set with the owner on 2026-07-12. The target user is a realtor in the field;
texting an update in from the car ("just closed with the Hendersons, met their kid Sarah")
is the headline use case, and web-only capture reintroduces the desk-bound friction the
product sells against. The capture→proposal→confirm→apply→audit pipeline is door-agnostic
(the web door proves it), so SMS is an adapter on the front, not a rebuild: a Twilio inbound
webhook that drops a text into the same capture path. The `SourceChannel` enum already
carries `'sms'` (`apps/control-plane/src/rows.ts`); no Twilio route exists yet
(`apps/control-plane/src/pipeline/capture.ts` hardcodes `channel: 'web'`).

## Decision

- **SMS is in beta scope as a core surface** (tracker Beta 5): Twilio inbound adapter +
  confirm-by-text UX (#101). Web remains the first surface (ADR-0010); SMS is added to beta
  scope, not sequenced ahead of web.
- **A2P 10DLC registration is an external clock that starts now** (#102, a refile of the
  reset-closed #24), independent of when the SMS code lands, because carrier approval has
  days-to-weeks lead time and would otherwise become the critical path.
- Confirmation over text ("reply Y" or a link back to the web confirm gate) is a genuine UX
  design question because the confirm gate is the trust/safety model; it is called out as
  design work, not plumbing.

## Consequences

- Adds the SMS workstream (#101/#102) and one owner-side external clock to the beta critical
  path.
- Reinforces the "one agent service, many doors" invariant: SMS is another adapter over the
  single pipeline, never a second writer.
- `requirements.md`'s SMS line and A2P open question are superseded by this ADR + `roadmap.md`.

## Alternatives considered

- **SMS as a deferred later door (the standing posture):** rejected. For this user segment,
  field texting may be the surface that proves the value proposition; deferring it also defers
  the A2P clock and risks it becoming the launch blocker.
- **Sequence SMS ahead of web:** rejected; ADR-0010 keeps web first as the surface that
  proves the loop, with SMS added alongside in beta scope.
