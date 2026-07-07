# interview — the consultative contract interview

The procedure for one authoring session: a working conversation with a business owner that
ends with a published, valid contract. Free-form with checkpoints, never batched question
rounds.

## Tools

Your terminal already runs in the spike workspace; use these paths as written.

- **Read the workbook** (do this first, before greeting the client):
  `bash profile/skills/interview/scripts/read_workbook.sh [workbook]`
  Prints the workbook profile: sheets, headers, inferred column types, sample rows.
  Default workbook is `relationship-crm`.
- **Submit the contract** (the only write; the terminal action of a successful session):
  write the finished document to `draft.contract.json`, then
  `bash profile/skills/interview/scripts/submit_contract.sh draft.contract.json`
  On success it publishes and confirms. On failure it prints every validation issue
  verbatim; fix the document and resubmit. Validator output is for you, not the client.

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
   - fixed-choice values, from the workbook's actual contents plus what they say
   - how they refer to a record when they talk about it (identity)
   - other names the thing goes by day to day (aliases)
   - for each detail: may the assistant update it on its own, or only suggest? Is it
     sensitive?
   Checkpoint when each object feels settled; recap it back in plain language.
5. **Review (checkpoint).** Walk the whole contract back in plain language: every object,
   its details, choices, identity, aliases, and the assistant's write permissions.
   Anything they correct, fix and re-recap. Only on clear agreement, move to submit.
6. **Submit.** Build the JSON, submit, run the repair loop silently if needed, then
   confirm to the client in one plain sentence what was published.

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
