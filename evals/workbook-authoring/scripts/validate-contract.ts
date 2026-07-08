/**
 * Validate a contract JSON document against the contract meta-schema.
 *
 * Usage: tsx scripts/validate-contract.ts <contract.json | ->
 *
 * Prints "VALID" and a one-line summary on success (exit 0).
 * Prints "INVALID" and every Zod issue verbatim, one per line, on failure
 * (exit 1). The verbatim issues are the repair signal for the authoring agent;
 * do not summarize or reword them.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { parseContract } from '@cormac/contract';

const arg = process.argv[2];
if (!arg) {
  console.error('usage: validate-contract.ts <contract.json | ->');
  process.exit(2);
}

let raw: string;
try {
  raw = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8');
} catch (err) {
  console.error(`INVALID\ncould not read input: ${(err as Error).message}`);
  process.exit(1);
}

let doc: unknown;
try {
  doc = JSON.parse(raw);
} catch (err) {
  console.error(`INVALID\nnot valid JSON: ${(err as Error).message}`);
  process.exit(1);
}

try {
  const contract = parseContract(doc);
  const objects = contract.objects
    .map((o) => `${o.apiName}(${o.fields.length} fields)`)
    .join(', ');
  console.log(`VALID`);
  console.log(
    `contract "${contract.name}" v${contract.version}: ${contract.objects.length} object(s): ${objects}; glossary ${contract.glossary.length} entr(ies)`,
  );
} catch (err) {
  console.error('INVALID');
  if (err instanceof z.ZodError) {
    for (const issue of err.issues) {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      console.error(`${path}: ${issue.message}`);
    }
  } else {
    console.error((err as Error).message);
  }
  process.exit(1);
}
