import { propose } from '../services/runtime-stub/src/propose.js';
import { CASES } from './cases.js';

/**
 * Minimal eval runner. Feeds each golden case through the agent and scores the
 * proposal shape. Today it exercises the deterministic stub (proves the
 * harness); against real Hermes it becomes the quality gate (ADR-009).
 */
let passed = 0;
const failures: string[] = [];

for (const testCase of CASES) {
  const out = propose({
    workspaceId: 'eval',
    contract: {},
    text: testCase.text,
    records: testCase.records,
  });
  const change = out.changes[0];
  const problems: string[] = [];

  if (!change) {
    problems.push('no change produced');
  } else {
    const exp = testCase.expect;
    if (change.op !== exp.op) problems.push(`op ${change.op} != ${exp.op}`);
    if (change.objectApiName !== exp.objectApiName)
      problems.push(`object ${change.objectApiName} != ${exp.objectApiName}`);
    if (exp.recordId && change.recordId !== exp.recordId)
      problems.push(`recordId ${String(change.recordId)} != ${exp.recordId}`);
    if (exp.fullName && change.values.full_name !== exp.fullName)
      problems.push(`full_name ${String(change.values.full_name)} != ${exp.fullName}`);
    for (const key of exp.valueKeys ?? []) {
      if (!(key in change.values)) problems.push(`missing value "${key}"`);
    }
  }

  if (problems.length === 0) {
    passed++;
    console.log(`PASS  ${testCase.name}`);
  } else {
    const line = `FAIL  ${testCase.name}: ${problems.join('; ')}`;
    failures.push(line);
    console.log(line);
  }
}

console.log(`\n${passed}/${CASES.length} passed`);
process.exit(failures.length > 0 ? 1 : 0);
