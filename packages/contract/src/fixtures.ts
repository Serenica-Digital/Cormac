import type { Contract } from './contract.js';
import { parseContract } from './contract.js';

/**
 * The minimal published contract the walking skeleton runs on: one Person
 * object with a couple of agent-editable fields, one human-only field
 * (internal_rating) that proves the agent-editability gate, and an identity
 * rule for matching. Shared by the seed script, the runtime stub, and tests so
 * they never drift.
 */
export const EXAMPLE_PERSON_CONTRACT: Contract = parseContract({
  name: 'Walking Skeleton Contract',
  version: 1,
  objects: [
    {
      objectId: 'obj_person',
      apiName: 'person',
      label: 'Person',
      identity: { displayFields: ['full_name', 'email'] },
      fields: [
        {
          fieldId: 'fld_full_name',
          apiName: 'full_name',
          label: 'Full name',
          type: 'string',
          required: true,
          editableByUser: true,
          editableByAgent: true,
        },
        {
          fieldId: 'fld_email',
          apiName: 'email',
          label: 'Email',
          type: 'email',
          editableByUser: true,
          editableByAgent: true,
          sensitive: true, // PII: stored, but never sent to the model context
        },
        {
          fieldId: 'fld_status',
          apiName: 'status',
          label: 'Status',
          type: 'enum',
          enumOptions: ['lead', 'active', 'dormant'],
          editableByUser: true,
          editableByAgent: true,
        },
        {
          fieldId: 'fld_last_interaction_date',
          apiName: 'last_interaction_date',
          label: 'Last interaction date',
          type: 'date',
          editableByUser: true,
          editableByAgent: true,
        },
        {
          fieldId: 'fld_last_interaction_note',
          apiName: 'last_interaction_note',
          label: 'Last interaction note',
          type: 'text',
          editableByUser: true,
          editableByAgent: true,
        },
        {
          fieldId: 'fld_internal_rating',
          apiName: 'internal_rating',
          label: 'Internal rating',
          type: 'number',
          editableByUser: true,
          editableByAgent: false, // human-only: the agent must never write this
        },
      ],
    },
  ],
});
