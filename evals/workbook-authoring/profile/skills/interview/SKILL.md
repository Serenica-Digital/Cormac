---
name: interview
description: "Procedure for one authoring session: a working conversation with a business owner that ends with a published, valid contract."
---
# interview — the consultative contract interview

The procedure for one authoring session: a working conversation with a business owner that
ends with a published, valid contract. Free-form with checkpoints. Lead with proposals the
client can correct, not rounds of questions: never open with a wall of questions, and never
march through an object field by field. Grouping several small calls into one proposal is
good; a batched interrogation is not.

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
   the disagreements. If your opening surfaced something that cuts across the shape (a
   record that sits in two categories, a tab that is really two things), say how your
   proposed shape handles it instead of letting it drop. Do not proceed until they have
   agreed what the objects are.
4. **Fill each object.** Once the shape is agreed, do not interview the object field by
   field. Present your best draft of it and let the client correct you: the details worth
   tracking (fields), each one's kind (dates, numbers, fixed choices, free text), which are
   must-have, and which the assistant may change on its own. Say it in plain language, in
   groups, then invite correction. Cover the following for each object (the order is not a
   script; follow the conversation), proposing your reading for each and opening a real
   question only when the answer carries consequences or the workbook cannot settle it:
   - **Fields and kinds.** Read them off the workbook and state them. Fold the routine
     calls (which are optional, which are dates or numbers) into your proposal instead of
     asking each one.
   - **Fixed vs. open lists (grouped).** In one pass, say which columns you will treat as
     open-ended lists that can grow and which as a closed set of choices ("Category, team
     lead, and sport all look like they will grow, so I will keep them open; the coverage
     regions look like a fixed set, so lock those?"). When the client confirms a set is
     closed, encode it as an `enum` with those values as `enumOptions`, never as free-text
     `string`; default to `string` only when the set is genuinely open.
   - **Lifecycle (settle this for every object).** Decide whether its records move through
     stages or statuses over time (a pipeline, a status, an open/closed or active/inactive
     state). Lead with your read, per object ("none of these look like they move through
     stages, right?"), so it stays a one-line confirmation when the answer is plainly no,
     and open it up only when the client says there is a lifecycle. Settle it for each
     object on its own; do not decide it once and carry the answer across objects. When
     there is a lifecycle, capture it as an `enum` field with the stages as `enumOptions`.
   - **Attention (settle once per object with date fields).** Lead with your read of how
     they spot who needs a touch when they scan this list ("looks like Follow-Up Date is
     what runs your Monday, and Date Last Contacted is how you spot who's gone quiet —
     right?"), and open a real question only when the workbook gives no signal. A date
     column that means "when I last touched them" gets `"semantic": "last_touch"`; one
     that means "when they next need attention" gets `"semantic": "follow_up"`. Cormac
     uses these tags to surface follow-ups due and relationships going quiet, so capture
     them whenever the client has such a rhythm.
   - **Fields that apply to only some records (name the pattern).** When a detail is
     filled in only for a subset (a sport only for sports operators, a coverage area only
     for bankers, opportunities-shown only for capital partners), say so and propose them
     as a group of optional fields that stay blank for the rest, in one breath, without
     interrogating each field's applicability on its own.
   - **Records that span categories or cells (resolve, never drop).** When the workbook
     shows one record sitting in two categories (the same person in two category tabs) or
     two things crammed into one cell, name it and settle it before the shape is locked.
     Offer the options with a recommendation: a single-value field, a field the record can
     carry more than one of (a multi-select set of choices), or separate records, and say
     the trade-off plainly. Never publish a single-value field that silently cannot hold
     what the workbook actually contains.
   - **Identity.** How they refer to a record when they talk about it, including the backup
     ("by name, firm if I forget"); the backup belongs in the identity fields too.
   - **Aliases.** Other names the thing goes by day to day.
   - **Assistant write permissions (propose a default split).** Propose a sensible default
     of what the assistant may change on its own versus only suggest (day-to-day
     maintenance such as contact dates, follow-up dates, and notes on its own; structural
     facts only on suggestion), then confirm. Do not ask this field by field.
   - **Sensitivity (ask once per object).** Ask plainly whether anything here should stay
     off a text or a shared screen ("anything here you'd rather keep off a shared
     screen?"). Do not skip this and do not default everything to not sensitive.
   Checkpoint when each object feels settled: recap it back in plain language, folding in
   anything the client corrected along the way.
5. **Review (checkpoint) — non-skippable.** Before anything is published, walk the whole
   contract back in plain language: every object, its details, choices, identity, aliases,
   the assistant's write permissions, what is marked sensitive, and any attention rules in
   the client's own terms ("I'll treat 'Date Last Contacted' as when you last touched
   someone, and surface follow-ups from 'Follow-Up Date' — right?"). Get the client's
   explicit agreement. This review always happens — never submit without it, and never
   skip or abbreviate it under time pressure. If the client is out of time ("I have a call
   in ten"), do not submit unreviewed: offer to pause and finish the review later. Anything
   they correct, fix and re-recap. Only on clear agreement, move to submit.
6. **Submit.** Only after the client's clear agreement on the recap. If they changed
   anything after you last recapped it (even a last-minute tweak, even under time
   pressure), recap that change back and get their agreement before submitting; never
   submit a correction they have not heard read back. Then call `submit_contract` with the
   finished document, run the repair loop silently if it returns issues, and confirm to the
   client in one plain sentence what was published.

## The contract document (mechanics: yours, never the client's)

Top level: `{ "name", "version": 1, "objects": [...], "glossary": [...] }`.

Each object: `objectId` (stable, e.g. `obj_contact`), `apiName` (snake_case), `label`,
`fields` (non-empty), `identity: { "displayFields": [field apiNames] }` (every name must
be a real field on the object), `aliases: [{ "canonical", "variants": [...] }]`.

Each field: `fieldId` (stable, e.g. `fld_full_name`), `apiName` (snake_case), `label`,
`type` (one of `string`, `text`, `number`, `boolean`, `date`, `datetime`, `enum`,
`email`, `phone`, `relationship`), `required`, `editableByUser`, `editableByAgent`,
`sensitive`, optional `excelColumn` (the source column header, keep it for traceability),
optional `semantic` (`"last_touch"` or `"follow_up"`; valid on `date`/`datetime` fields
only). `semantic` records what the date means to the business's rhythm: `last_touch` is
when the record was last contacted or worked, `follow_up` is when it next needs attention.
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

A dropped formula is still evidence. A derived column like "Days Since Contact" is the
client's attention rule written down; drop the column, keep the meaning. Trace it to its
source date field, confirm in plain terms ("so 'Days Since Contact' counts from 'Date
Last Contacted', and that's how you spot who's gone quiet?"), and set the source field's
`semantic` accordingly. Never let the rule a formula encoded leave the contract with the
formula.
