# SMS Compliance

Status: stub (pending SMS surface + A2P)
Maps to: control-register row 16
Last reviewed: 2026-06-06

Blocked on: building the Twilio SMS surface and completing A2P 10DLC registration. The registration clock runs independently of code, so it should start early (see [../prd/build-plan.md](../prd/build-plan.md)).

## Intended content

- **A2P 10DLC registration**: business brand and messaging campaign registered with the carriers via Twilio, with status recorded here. Required before production application SMS.
- **Consent**: how opt-in is captured and recorded for each number that texts the CRM.
- **Opt-out**: STOP/HELP handling (provider-managed or implemented), and how opt-out state is honored on the next message.
- **Sender verification**: the Twilio webhook verifies the request signature before mapping a sender to a workspace; unknown senders are rejected safely.
- **Logging**: every inbound message becomes a source message and every outbound confirmation is logged (under the audit model, [audit-logging.md](audit-logging.md)).
- **Abuse and rate limits**.

## To make this real

Build the Twilio webhook with signature verification and sender-to-workspace mapping, complete A2P registration, document consent/opt-out language, and flip control-register row 16.
