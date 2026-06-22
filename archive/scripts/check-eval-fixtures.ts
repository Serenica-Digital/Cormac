import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseContract } from '@cormac/contract';

/**
 * Structural validation of the eval fixtures, with ZERO model calls. CI step
 * `check:eval-fixtures`. This does NOT run or score evals (those stay manual,
 * non-deterministic, and need an API key, see evals/README.md). It only proves
 * that every golden parses as a contract and every fixture loads as JSON, so a
 * broken golden or schema drift is caught here rather than mid eval run.
 */
const ROOT = process.cwd();
const goldenDir = 'evals/workbook-contract/golden';
const fixtureDir = 'evals/workbook-contract/fixture';
const errors: string[] = [];

if (!existsSync(join(ROOT, goldenDir)) || !existsSync(join(ROOT, fixtureDir))) {
  console.log('Eval-fixtures check: no workbook-contract fixtures present, nothing to validate.');
  process.exit(0);
}

const goldens = readdirSync(join(ROOT, goldenDir)).filter((n) => n.endsWith('.contract.json'));
for (const f of goldens) {
  try {
    parseContract(JSON.parse(readFileSync(join(ROOT, goldenDir, f), 'utf8')));
  } catch (e) {
    errors.push(`golden ${f} does not parse as a contract: ${(e as Error).message}`);
  }
}

const fixtures = readdirSync(join(ROOT, fixtureDir)).filter((n) => n.endsWith('.detected.json'));
for (const f of fixtures) {
  try {
    JSON.parse(readFileSync(join(ROOT, fixtureDir, f), 'utf8'));
  } catch (e) {
    errors.push(`fixture ${f} is not valid JSON: ${(e as Error).message}`);
  }
}

if (errors.length > 0) {
  console.error(`Eval-fixtures check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Eval-fixtures check: ${goldens.length} goldens parse, ${fixtures.length} fixtures load (no model calls).`,
);
