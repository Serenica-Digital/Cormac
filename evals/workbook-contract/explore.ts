import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { runAgent, getModel, type TokenUsage } from './agent.js';
import type { AuthoringOutput } from './authoring-schema.js';
import { detectWorkbook, summarizeProfile } from './detect.js';
import { sumUsage, totalTokens, estimateCostUSD } from './usage.js';

/**
 * Exploratory run for a REAL workbook (ADR-023 §6). There is no golden answer
 * key for a real client file, so this does not score: it detects the workbook,
 * runs the agent, and presents the proposed contract plus its questions for a
 * human to judge. The human is the reviewer the publish gate assumes.
 *
 * Real client data: the detected profile and the agent outputs contain PII and
 * are written only to the gitignored local/ directory. Nothing here is committed.
 *
 * Usage:  pnpm evals:workbook:explore -- /path/to/workbook.xlsx
 *   or    SPIKE_XLSX=/path/to/workbook.xlsx pnpm evals:workbook:explore
 */

const here = dirname(fileURLToPath(import.meta.url));
const localDir = join(here, 'local'); // gitignored
const N = Number(process.env.SPIKE_RUNS ?? '2');

function printContract(out: AuthoringOutput): void {
  for (const o of out.objects) {
    console.log(`\n  OBJECT  ${o.apiName} (${o.label})   identity: ${o.identityDisplayFields.join(' + ')}`);
    if (o.aliases.length)
      console.log(`          aliases: ${o.aliases.map((a) => `${a.canonical} <- ${a.variants.join('/')}`).join('; ')}`);
    for (const f of o.fields) {
      const bits: string[] = [f.type];
      if (f.type === 'enum' && f.enumOptions) bits.push(`[${f.enumOptions.join(' | ')}]`);
      if (f.type === 'relationship') bits.push(`-> ${f.relationshipTargetType ?? '?'}`);
      bits.push(f.editableByAgent ? 'agent-writable' : 'HUMAN-ONLY');
      if (f.sensitive) bits.push('PII');
      console.log(`          - ${f.apiName} (${f.label}): ${bits.join('  ')}`);
    }
  }
}

function stabilitySignature(out: AuthoringOutput): string {
  return out.objects
    .map((o) => {
      const id = [...o.identityDisplayFields].map((s) => s.toLowerCase()).sort().join('+');
      const rels = o.fields.filter((f) => f.type === 'relationship').map((f) => `${f.apiName}->${f.relationshipTargetType ?? '?'}`).sort().join(',');
      return `${o.apiName}{id:${id}|rel:${rels}}`;
    })
    .sort()
    .join('  ');
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? process.env.SPIKE_XLSX;
  if (!path) {
    console.error('Usage: pnpm evals:workbook:explore -- /path/to/workbook.xlsx');
    console.error('   or: SPIKE_XLSX=/path/to/workbook.xlsx pnpm evals:workbook:explore');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set (put it in .env).');
    process.exit(1);
  }

  mkdirSync(localDir, { recursive: true });
  const stem = basename(path).replace(/\.[^.]+$/, '');

  // 1. Mechanical detection (offline). Write the profile to the gitignored local dir.
  console.log(`Detecting ${path} ...`);
  const profile = await detectWorkbook(path);
  writeFileSync(join(localDir, `${stem}.detected.json`), JSON.stringify(profile, null, 2));
  console.log(summarizeProfile(profile));

  // 2. Run the agent N times. No golden, so no scoring — present for human judgment.
  console.log(`\nRunning the contract agent (${getModel()}, ${N} run(s); no golden — exploratory) ...`);
  const usages: Array<TokenUsage | null> = [];
  const elapsedMs: number[] = [];
  const signatures: string[] = [];

  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    const run = await runAgent(profile);
    elapsedMs.push(Date.now() - t0);
    usages.push(run.usage);
    signatures.push(stabilitySignature(run.rawOutput));

    console.log(`\n================ PROPOSED CONTRACT — run ${i + 1}/${N} ================`);
    console.log(`validity (parseContract): ${run.contract ? 'OK' : `FAILED — ${run.contractError}`}`);
    printContract(run.rawOutput);
    console.log(`\n  ASSUMPTIONS:`);
    run.rawOutput.assumptions.forEach((a) => console.log(`   - ${a}`));
    console.log(`  OPEN QUESTIONS (what it would ask the manager):`);
    run.rawOutput.openQuestions.forEach((q) => console.log(`   - ${q}`));
    console.log(`  LOW CONFIDENCE (its least-sure high-stakes calls):`);
    run.rawOutput.lowConfidence.forEach((l) => console.log(`   - ${l.area}: ${l.why}`));

    writeFileSync(
      join(localDir, `${stem}.run-${i + 1}.json`),
      JSON.stringify({ model: run.model, usage: run.usage, rawOutput: run.rawOutput, contract: run.contract, contractError: run.contractError }, null, 2),
    );
  }

  // 3. Stability + usage.
  const distinct = [...new Set(signatures)];
  console.log(`\n================ DECISION STABILITY (${N} runs) ================`);
  console.log(distinct.length === 1 ? 'STABLE (identity + relationships identical across runs)' : `${distinct.length} distinct variants:`);
  if (distinct.length > 1) distinct.forEach((s, i) => console.log(`  variant ${i + 1}: ${s}`));

  const totals = sumUsage(usages);
  const { tier, usd } = estimateCostUSD(getModel(), totals);
  const totalMs = elapsedMs.reduce((a, b) => a + b, 0);
  console.log(`\n================ USAGE & COST ================`);
  console.log(`tokens  input ${totals.inputTokens}  output ${totals.outputTokens}  total ${totalTokens(totals)}`);
  console.log(`latency mean ${(totalMs / N / 1000).toFixed(1)}s`);
  console.log(`est cost $${usd.toFixed(4)} (${tier} rates, approximate)`);
  console.log(`\nArtifacts (gitignored) in ${localDir}`);
}

main().catch((err) => {
  console.error('\nERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
