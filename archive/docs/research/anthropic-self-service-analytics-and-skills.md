# Anthropic Self-Service Analytics And Skills: CRM Application Note

Status: research/application note
Date reviewed: June 5, 2026
Source: Anthropic, "How Anthropic enables self-service data analytics with Claude"
URL: https://claude.com/blog/how-anthropic-enables-self-service-data-analytics-with-claude

## Why This Source Matters

Anthropic's post is relevant because it describes how Anthropic supports nontechnical users asking data questions through Claude while managing ambiguity, stale information, data discovery, tool use, skills, and repeatable analysis behavior.

Our project is not a self-service analytics product, but it has the same core reliability problem:

- Users ask natural-language questions.
- Users provide messy natural-language updates.
- The agent needs to choose the right structured data.
- The agent must understand business-specific vocabulary.
- The system must prevent ambiguous or stale context from producing bad answers or bad writes.

## Direct Relevance Rating

8/10.

The post is not a direct product blueprint for an AI CRM, but it is highly relevant to agent architecture, governed context, skill design, provenance, and the limits of raw retrieval.

## Key Ideas From The Source

### 1. Model Quality Is Not Enough

Anthropic emphasizes that data tasks fail when the model lacks the right context, definitions, or data access path. For our CRM, this means agent reliability should not depend only on the base model. The product needs governed context: schema contracts, definitions, aliases, source records, and business rules.

### 2. Ambiguity Is A Primary Failure Mode

Analytics users may ask questions with ambiguous concepts or entity names. CRM users will do the same:

- "John" could refer to multiple people.
- "Oak" could refer to a property, deal, entity, lender process, or project.
- "Waiting on lender" may have client-specific meaning.

The system should detect ambiguity and ask clarifying questions or create proposals for review.

### 3. Stale Or Missing Data Creates Bad Answers

If the system cannot find current source data, it may answer from stale context or infer incorrectly. CRM answers should therefore expose freshness and provenance where practical.

For our project, this supports:

- Source messages.
- Audit events.
- Last-updated timestamps.
- Linked records.
- Weekly change reports.
- Conflict/proposal queues.

### 4. Governed Tools Beat Raw Retrieval Alone

The post supports the idea that agents need reliable tools and curated context, not just a pile of raw documents. For us, raw email/text/document retrieval should be secondary to structured CRM records, schema contracts, and source-linked proposals.

### 5. Skills And Reference Docs Are Reusable Operating Context

Anthropic's skills/reference-doc approach maps cleanly to versioned client-specific agent instructions and domain references:

- How to classify an SMS.
- How to extract a follow-up.
- How to interpret a deal stage.
- How to resolve ambiguous entities.
- When to ask for confirmation.

## Product Translation

Anthropic's post frames agent reliability as a context-engineering problem, not just a model-selection problem. For our AI CRM, the analogous product pattern is:

> Give the agent versioned, client-specific skills and reference docs tied to schema contracts, source records, and approval rules.

The product should not rely on one generic prompt such as "be a helpful CRM assistant." It should maintain structured operating context that evolves with each customer.

## Proposed Skill Model

### 1. Workspace CRM Agent Skill

Purpose:

Top-level routing and safety instructions for the workspace agent.

Responsibilities:

- Identify the workspace and user.
- Classify user intent: update, question, reminder, correction, report, admin/config request.
- Use schema contract definitions before raw text.
- Create source messages for inbound SMS/email/web updates.
- Create proposals for writes.
- Apply only changes allowed by the workspace confirmation policy.
- Log audit events.
- Ask clarifying questions when entity matching is ambiguous.

### 2. SMS Update Skill

Purpose:

Interpret inbound text messages as CRM updates, questions, reminders, or corrections.

Responsibilities:

- Parse short, informal messages.
- Match people, organizations, deals, properties/assets, and tasks.
- Preserve the original SMS as source evidence.
- Draft proposed changes.
- Send concise responses suitable for SMS.
- Avoid using SMS as the only review surface for complex changes.

### 3. Email Thread Extraction Skill

Purpose:

Extract CRM-relevant information from forwarded email threads or mailbox-ingested messages.

Responsibilities:

- Identify sender/recipient context.
- Extract people, organizations, deal references, dates, documents, and next steps.
- Avoid over-weighting quoted/stale thread content.
- Create proposed notes/tasks/record updates.
- Link the proposal to the email source.

### 4. CRM Question Answering Skill

Purpose:

Answer natural-language questions about CRM state.

Responsibilities:

- Query structured CRM data first.
- Use schema aliases and client-specific definitions.
- Cite linked source records where practical.
- Avoid unsupported claims when data is missing.
- Flag stale or incomplete data.

### 5. Weekly Change Report Skill

Purpose:

Prepare a chronological report of CRM changes since the last report.

Responsibilities:

- List changes by timestamp.
- Include actor/source: SMS, email, web, agent, import/sync.
- Include affected records.
- Include before/after summaries where useful.
- Highlight unresolved proposals/conflicts.
- Send through email/SMS summary or show in web app.

### 6. Schema Contract Mapping Skill

Purpose:

Help convert Excel-authored or client-defined structures into a stable schema contract.

Responsibilities:

- Interpret object/table names.
- Map Excel columns to internal field definitions.
- Detect missing required metadata.
- Propose field types and enums.
- Flag ambiguous relationships.
- Require review before schema changes are applied.

## Where Skills Live

These skills do not have to be Claude Code skills. In the product, they should likely live as versioned workspace configuration in Supabase/Postgres:

- `agent_skill_versions`
- `schema_contract_versions`
- `agent_reference_docs`
- `agent_eval_cases`
- `agent_correction_log`

The backend can load the active skill/reference set when calling Claude/OpenAI.

## Relationship To Schema Contracts

Schema contracts define the data structure:

- object types
- fields
- relationships
- validation rules
- aliases
- Excel mappings

Skills define the operating behavior:

- how to classify messages
- how to use the schema
- how to handle ambiguity
- when to ask for confirmation
- how to report changes

The agent should use both. A schema without skills is too mechanical. A skill without a schema is too vague.

## Correction Loop

Corrections should become durable product data.

Examples:

- User says: "Wrong John."
- User says: "That is not a lender follow-up."
- User rejects a proposal as the wrong deal.
- User edits the proposed task due date.

The system should capture:

- source proposal
- correction text
- corrected record/field
- reason/category
- whether schema aliases should change
- whether an eval case should be created

This creates a lightweight improvement loop:

1. Agent makes proposal.
2. User corrects.
3. Correction is logged.
4. Future prompts/context are updated.
5. Optional eval catches regressions.

## V1 Scope Recommendation

Build the skill architecture lightly from the start:

- Create versioned workspace agent instructions.
- Store schema contract descriptions and aliases.
- Store correction logs.
- Support weekly change reports.
- Use source-linked proposals.

Do not overbuild:

- Full eval dashboard.
- Full self-service skill editor.
- Complex skill marketplace.
- Automatic prompt rewriting from corrections.

V1 should prove the loop manually and structurally before making it fully self-service.

## PRD Implications

This source supports the following PRD directions:

- Schema-contract-first architecture.
- Source messages and audit trails.
- Client-specific agent skills/reference docs.
- Corrections and evals as part of the product loop.
- Structured data before raw retrieval.
- Clarifying questions for ambiguous updates.
- Weekly chronological change reporting.

## PRD Language

Use:

> Each workspace will have versioned agent skills and reference docs tied to its schema contract. These skills define how the agent interprets SMS/email updates, asks questions, proposes changes, handles ambiguity, and reports activity.

Avoid:

> The model will just learn the customer's CRM style automatically.

## Open Questions

- Should Agent Admins edit skill text directly, or through structured settings?
- Should corrections automatically update aliases/rules, or require admin approval?
- How much of the weekly change report should go over SMS versus email/web?
- Which eval cases are required before allowing auto-applied low-risk changes?

