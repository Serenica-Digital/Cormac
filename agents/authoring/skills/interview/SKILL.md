---
name: interview
description: "Procedure for one authoring session: a working conversation with a business owner that ends with a published, valid contract."
---
# interview — the consultative contract interview

The procedure for one authoring session: a working conversation with a business owner that
ends with a published, valid contract. Free-form with checkpoints, never batched question
rounds.

## Tools

You have two tools; you call them directly (there is no shell).

- **`read_workbook`** (do this first, before greeting the client): returns the workbook
  profile — sheets, headers, inferred column types, sample rows. Optional `workbook`
  argument; the default is `relationship-crm`.
- **`submit_contract`** (the only write; the terminal action of a successful session): pass
  the finished contract document as the `contract` argument. On success it publishes and
  returns a summary. On failure it returns every validation issue verbatim (path +
  message); fix the document and call it again. Validator output is for you, not the client.

## Procedure

1. **Prepare.** Read the workbook. Form a hypothesis: what things does this business
   track; which tabs or columns are the same thing under different names; what looks
   computed, stale, or ambiguous. Note specifics to bring up by name.
2. **Open.** Greet briefly. Show them what you noticed in their own vocabulary and invite
   correction. Set the frame: you will agree on the shape first, then fill in details
   together, then review everything before anything is final.
3. **Agree the shape (checkpoint).** Propose the objects: the kinds of things the
   business tracks, with your reasoning ("three tabs, one kind of relationship?"). Work
   the disagreements. Do not proceed until they have agreed what the objects are.
4. **Fill each object.** For each agreed object, work through, conversationally and in
   whatever order the conversation makes natural:
   - the details worth tracking (fields), their kind (dates, numbers, fixed choices,
     free text), and which are must-have
   - **lifecycle (ask this for every object).** Ask whether its records move through
     stages or statuses over time — a pipeline, a status, an open/closed or active/
     inactive state ("do these move through stages — a lead becoming a client, a deal
     opening and closing?"). If they do, capture it as an `enum` field with the stages as
     `enumOptions`. This question is not optional; ask it even when no column obviously
     names a status.
   - fixed-choice values, from the workbook's actual contents plus what they say. When a
     column shows only a few distinct values (an owner column, a category, a status), ask
     whether that set is closed ("is it always one of these, or could it be anything?").
     **Rule:** when the client confirms the set is closed, encode it as an `enum` with
     those values as `enumOptions` — never as free-text `string`. Default to `string` only
     when the set is genuinely open.
   - how they refer to a record when they talk about it (identity). Record what they
     actually say, including the backup ("by name, firm if I forget") — the backup
     belongs in the identity fields too
   - other names the thing goes by day to day (aliases)
   - for each detail: may the assistant update it on its own, or only suggest?
   - sensitivity, asked explicitly at least once per object, in plain terms ("anything
     here you'd rather not have show up in a text or a shared screen?"). Do not skip
     this and do not default everything to not sensitive
   Checkpoint when each object feels settled; recap it back in plain language.
5. **Review (checkpoint) — non-skippable.** Before anything is published, walk the whole
   contract back in plain language: every object, its details, choices, identity, aliases,
   the assistant's write permissions, and what is marked sensitive. Get the client's
   explicit agreement. This review always happens — never submit without it, and never
   skip or abbreviate it under time pressure. If the client is out of time ("I have a call
   in ten"), do not submit unreviewed: offer to pause and finish the review later. Anything
   they correct, fix and re-recap. Only on clear agreement, move to submit.
6. **Submit.** Call `submit_contract` with the finished document; run the repair loop
   silently if it returns issues, then confirm to the client in one plain sentence what was
   published.

## The contract document (mechanics: yours, never the client's)

Top level: `{ "name", "version": 1, "objects": [...], "glossary": [...] }`.

Each object: `objectId` (stable, e.g. `obj_contact`), `apiName` (snake_case), `label`,
`fields` (non-empty), `identity: { "displayFields": [field apiNames] }` (every name must
be a real field on the object), `aliases: [{ "canonical", "variants": [...] }]`.

Each field: `fieldId` (stable, e.g. `fld_full_name`), `apiName` (snake_case), `label`,
`type` (one of `string`, `text`, `number`, `boolean`, `date`, `datetime`, `enum`,
`email`, `phone`, `relationship`), `required`, `editableByUser`, `editableByAgent`,
`sensitive`, optional `excelColumn` (the source column header, keep it for traceability).
An `enum` field must carry non-empty `enumOptions`. A `relationship` field must carry
`relationshipTargetType` (the target object's `apiName`).

Glossary entries are optional: business meaning that is not field-shaped
(`{ "entryId", "term", "definition", "appliesTo"? }`). Use them for things the client
explains that matter but fit no column.

### Glossary `appliesTo` — pitfall

The validator expects an object, not a string or array. Correct shapes:

    { "objectApiName": "some_object" }
    { "objectApiName": "some_object", "fieldApiName": "some_field" }

Each glossary entry can only point at ONE object. If a concept spans multiple objects,
either omit `appliesTo` (making it contract-wide) or create one entry per object. A
comma-separated string or an array will fail ("Expected object, received string/array").

### Computed columns

Drop any column that is clearly a formula or derived value (e.g. "Days Since Contact"
computed from a date). Confirm with the client if unsure — but when they say "I never
touch it, it's a formula," drop it without further ceremony.
