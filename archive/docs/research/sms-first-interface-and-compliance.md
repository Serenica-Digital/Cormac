# SMS-First Interface And Compliance: Research Note

Status: research/application note
Date reviewed: June 5, 2026

## Why This Topic Matters

SMS is not a secondary notification channel for this product. Based on the pivot discussion, texting is intended to be a primary way the user interacts with the CRM:

- Send updates after calls.
- Ask CRM questions.
- Receive reminders.
- Receive summaries or change reports.
- Potentially confirm or correct proposed changes.

That makes SMS part of the core product architecture, not a later integration add-on.

## Direct Relevance Rating

10/10.

SMS-first UX affects v1 scope, Twilio setup, compliance, user identity, agent safety, audit design, and whether the product feels meaningfully different from a normal CRM.

## Source Takeaways

### A2P 10DLC Applies To US Business Messaging

Twilio treats US business messaging over 10-digit long-code numbers as A2P 10DLC. Registration includes brand and campaign/use-case registration, and approval timelines involve carriers and vetting partners.

Project implication:

- Production SMS is not just an API call.
- A2P registration, fees, campaign descriptions, and compliance language belong in v1 if SMS is primary.
- Prototype/demo texting can move faster, but production use needs the compliance path.

### Consent And Opt-Out Matter

Twilio messaging policies require appropriate consent, clear messaging use cases, and opt-out handling. Transactional/internal workflow messages still need thoughtful consent and user expectations.

Project implication:

- Each user should explicitly enroll their phone number.
- The product should document what kinds of messages it sends.
- STOP/opt-out behavior must be handled.
- Outbound reminders/reports must respect user preferences.

### Webhooks Need Request Validation

Twilio recommends validating incoming webhook requests to confirm they came from Twilio.

Project implication:

- Inbound SMS should hit a backend/Edge Function.
- The backend should validate Twilio signatures.
- Unknown senders should not create CRM records.
- SMS identity mapping should be workspace-scoped.

## Recommended SMS Architecture

```text
Inbound SMS
  -> Twilio number / Messaging Service
  -> Twilio webhook
  -> backend or Supabase Edge Function
  -> validate Twilio signature
  -> map phone number to user/workspace
  -> create source_message
  -> classify intent
  -> answer question or create agent_proposal
  -> log audit event
  -> send concise SMS response
```

## SMS Interaction Modes

### Mode 1: Capture Update

User texts:

"Met with First National. They need rent roll by Friday."

System:

- Creates source message.
- Extracts people/orgs/deals/tasks.
- Drafts proposal.
- Replies with a concise summary.

### Mode 2: Ask CRM

User texts:

"What deals are waiting on lender response?"

System:

- Queries CRM.
- Returns short answer.
- Includes enough source/context to be useful.
- Offers follow-up action if needed.

### Mode 3: Reminder / Follow-Up

System texts:

"Reminder: send rent roll to First National today."

System:

- Logs outbound message.
- Allows user to reply with status/update.

### Mode 4: Correction

User texts:

"Wrong John. That was John Miller at First National."

System:

- Links correction to recent proposal/source.
- Updates correction log.
- Creates revised proposal or asks clarification.

### Mode 5: Confirmation / Approval

This is the riskiest mode.

Possible patterns:

- No SMS approvals; web review required.
- SMS can approve low-risk tasks/notes only.
- SMS can approve with explicit structured response.
- SMS approval allowed only for users who choose that policy.

Project recommendation:

SMS can be primary for capture and questions, but complex or high-risk updates should go through web review or appear in the weekly change report until the confirmation model is proven.

## Confirmation Model Recommendation

Design configurable confirmation patterns, but default conservatively:

- Read-only questions: answer by SMS.
- New note/task proposals: can be created from SMS and optionally auto-applied if workspace policy allows.
- High-impact record changes: proposal first.
- Ambiguous entities: ask clarification.
- Schema changes, permissions, integrations: never approve only by SMS.
- Weekly report: always summarize all changes chronologically.

## Weekly Change Report

Because SMS is conversational and low-friction, the weekly report becomes a core trust mechanism.

Report should include:

- Chronological list of changes since last report.
- Source: SMS, email, web, import/sync, agent.
- Actor/user.
- Affected records.
- Before/after summary for important fields.
- Pending proposals.
- Conflicts or ambiguous corrections.

This report is not just a nice feature; it is the safety net for a low-friction SMS-first UX.

## V1 Recommendation

SMS is in v1 as a primary interface:

- Inbound SMS capture.
- SMS questions.
- SMS reminders.
- SMS-linked source messages.
- SMS responses.
- Weekly chronological change report.
- Twilio/A2P compliance path.

Defer or constrain:

- Broad SMS-only approvals.
- PIN-code style approvals as a primary security model.
- Sensitive admin/config changes by SMS.
- Complex multi-step review inside SMS.

## Open Questions

- Which changes can be auto-applied from SMS?
- Should users configure their own confirmation patterns?
- Should workspace admins set confirmation rules globally?
- How much weekly report detail should be sent over SMS versus email/web?
- What is the first Twilio setup: product-owned number, per-customer number, or per-user number?
- Will production SMS use Twilio subaccounts per customer?

## Sources

- Twilio, A2P 10DLC overview: https://www.twilio.com/docs/sms/a2p-10dlc
- Twilio, A2P 10DLC help article: https://help.twilio.com/articles/1260800720410-What-is-A2P-10DLC
- Twilio, A2P registration/campaign guide: https://help.twilio.com/hc/en-us/articles/1260803965530-A2P-10DLC-Campaign-Registration-Guide
- Twilio, Messaging Policy: https://www.twilio.com/en-us/legal/messaging-policy
- Twilio, Validating webhook requests: https://www.twilio.com/docs/usage/security#validating-requests
- Twilio, Messaging multi-tenancy: https://www.twilio.com/docs/messaging/features/multi-tenancy

