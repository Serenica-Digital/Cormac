import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseContract } from '@serenica/contract';
import { runAgent, getModel, type AgentRun, type TokenUsage } from './agent.js';
import { score, type ScoreReport } from './score.js';
import type { AuthoringOutput } from './authoring-schema.js';
import { sumUsage, totalTokens, estimateCostUSD } from './usage.js';

/**
 * Workbook Contract Agent spike runner (ADR-023 feasibility). Feeds one messy
 * detected workbook profile through the agent N times, scores each run against
 * the golden contract, and reports the per-dimension scorecard, the
 * plausible-but-wrong list, uncertainty recall, and decision stability.
 *
 * A low score is data, not a test failure: this exits non-zero only on a harness
 * error (no successful run), never because the agent scored poorly.
 */

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, 'golden', 'contacts-deals.contract.json');
const fixturePath = join(here, 'fixture', 'contacts-deals.detected.json');
const outDir = join(here, 'out');

const N = Number(process.env.SPIKE_RUNS ?? '3');

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function printReport(i: number, run: AgentRun, r: ScoreReport): void {
  console.log(`\n================ RUN ${i + 1} / ${N}  (model: ${run.model}) ================`);
  console.log(`validity (parseContract): ${r.validity.ok ? 'OK' : `FAILED — ${r.validity.error}`}`);
  console.log(
    `objects   recall ${pct(r.objectCoverage.recall)}  precision ${pct(r.objectCoverage.precision)}  (matched ${r.objectCoverage.matched}/${r.objectCoverage.golden}${r.objectCoverage.extra.length ? `, extra: ${r.objectCoverage.extra.join(',')}` : ''})`,
  );
  console.log(
    `fields    recall ${pct(r.fieldCoverage.recall)}  precision ${pct(r.fieldCoverage.precision)}  (matched ${r.fieldCoverage.matched}/${r.fieldCoverage.golden})`,
  );
  console.log(`types     ${r.typeCorrectness.correct}/${r.typeCorrectness.total} correct`);
  console.log(`enums     ${r.enumCapture.ok}/${r.enumCapture.total} captured`);
  console.log(`identity  ${r.identity.correct}/${r.identity.total} objects correct      [HIGH-STAKES]`);
  console.log(`relations ${r.relationships.found}/${r.relationships.expected} found            [HIGH-STAKES]`);
  console.log(`agent-write ${r.agentWrite.match}/${r.agentWrite.total} flags match  trust-misses: ${r.agentWrite.trustMisses.length}  [HIGH-STAKES]`);
  console.log(`sensitive ${r.sensitive.match}/${r.sensitive.total} flags match`);
  console.log(`aliases   ${r.aliases.captured}/${r.aliases.total} objects`);

  const detailLines = [
    ...r.identity.details.map((d) => `  identity   ${d}`),
    ...r.relationships.details.map((d) => `  relation   ${d}`),
    ...r.agentWrite.trustMisses.map((d) => `  TRUST      ${d}`),
    ...r.typeCorrectness.mismatches.map((d) => `  type       ${d}`),
    ...r.enumCapture.details.map((d) => `  enum       ${d}`),
    ...r.fieldCoverage.missed.map((d) => `  missed     ${d}`),
    ...r.sensitive.misses.map((d) => `  sensitive  ${d}`),
    ...r.aliases.details.map((d) => `  alias      ${d}`),
  ];
  if (detailLines.length) {
    console.log('  --- diffs ---');
    for (const l of detailLines) console.log(l);
  }

  console.log(
    `  uncertainty recall: ${r.uncertainty.flagged}/${r.uncertainty.totalIssues} issues flagged (${pct(r.uncertainty.recall)});  critical: ${r.uncertainty.criticalFlagged}/${r.uncertainty.criticalTotal} (${pct(r.uncertainty.criticalRecall)})`,
  );
  if (r.uncertainty.plausibleButWrong.length) {
    console.log('  --- PLAUSIBLE-BUT-WRONG (critical, and the agent did NOT flag it) ---');
    for (const issue of r.uncertainty.plausibleButWrong) console.log(`  !! [${issue.dimension}] ${issue.detail}`);
  } else if (r.uncertainty.criticalTotal > 0) {
    console.log('  (all critical misses were at least flagged by the agent — human-in-the-loop would catch them)');
  }
}

/** Identity + relationship fingerprint of one run, for stability across runs. */
function stabilitySignature(out: AuthoringOutput): string {
  const objs = out.objects
    .map((o) => {
      const id = [...o.identityDisplayFields].map((s) => s.toLowerCase()).sort().join('+');
      const rels = o.fields
        .filter((f) => f.type === 'relationship')
        .map((f) => `${f.apiName}->${f.relationshipTargetType ?? '?'}`)
        .sort()
        .join(',');
      return `${o.apiName}{id:${id}|rel:${rels}}`;
    })
    .sort()
    .join('  ');
  return objs;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    console.error('Run:  ANTHROPIC_API_KEY=sk-... pnpm evals:workbook');
    console.error('(optional: SPIKE_MODEL=claude-sonnet-4-6  SPIKE_RUNS=3)');
    process.exit(1);
  }

  const golden = parseContract(JSON.parse(readFileSync(goldenPath, 'utf8')));
  const detected = JSON.parse(readFileSync(fixturePath, 'utf8'));
  mkdirSync(outDir, { recursive: true });

  console.log(`Workbook Contract Agent spike — model ${getModel()}, ${N} run(s)`);
  console.log(`golden: ${golden.objects.length} objects, ${golden.objects.reduce((n, o) => n + o.fields.length, 0)} fields`);

  const reports: ScoreReport[] = [];
  const signatures: string[] = [];
  const usages: Array<TokenUsage | null> = [];
  const elapsedMs: number[] = [];

  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    const run = await runAgent(detected);
    const ms = Date.now() - t0;
    const r = score(golden, run.rawOutput, run.contractError);
    reports.push(r);
    signatures.push(stabilitySignature(run.rawOutput));
    usages.push(run.usage);
    elapsedMs.push(ms);
    printReport(i, run, r);
    if (run.usage)
      console.log(
        `  usage: in ${run.usage.inputTokens} out ${run.usage.outputTokens}${run.usage.cacheReadTokens ? ` cache-read ${run.usage.cacheReadTokens}` : ''}  (${(ms / 1000).toFixed(1)}s)`,
      );
    writeFileSync(
      join(outDir, `run-${i + 1}.json`),
      JSON.stringify({ model: run.model, usage: run.usage, elapsedMs: ms, rawOutput: run.rawOutput, contract: run.contract, contractError: run.contractError, score: r }, null, 2),
    );
  }

  // decision stability across runs (the high-stakes calls)
  const distinct = [...new Set(signatures)];
  console.log(`\n================ DECISION STABILITY (${N} runs) ================`);
  console.log(`identity + relationship fingerprints: ${distinct.length === 1 ? 'STABLE (identical across all runs)' : `${distinct.length} distinct variants`}`);
  distinct.forEach((s, i) => console.log(`  variant ${i + 1} (${signatures.filter((x) => x === s).length}x): ${s}`));

  // aggregate headline
  const avg = (f: (r: ScoreReport) => number): number => reports.reduce((s, r) => s + f(r), 0) / reports.length;
  console.log(`\n================ AGGREGATE (mean of ${N} runs) ================`);
  console.log(`field recall            ${pct(avg((r) => r.fieldCoverage.recall))}`);
  console.log(`type correctness        ${pct(avg((r) => ratioOf(r.typeCorrectness.correct, r.typeCorrectness.total)))}`);
  console.log(`identity correct        ${pct(avg((r) => ratioOf(r.identity.correct, r.identity.total)))}   [HIGH-STAKES]`);
  console.log(`relationships found     ${pct(avg((r) => ratioOf(r.relationships.found, r.relationships.expected)))}   [HIGH-STAKES]`);
  console.log(`agent-write flags match ${pct(avg((r) => ratioOf(r.agentWrite.match, r.agentWrite.total)))}   [HIGH-STAKES]`);
  console.log(`trust misses (mean)     ${avg((r) => r.agentWrite.trustMisses.length).toFixed(2)} per run`);
  console.log(`uncertainty recall      ${pct(avg((r) => r.uncertainty.recall))}  (critical ${pct(avg((r) => r.uncertainty.criticalRecall))})`);
  console.log(`plausible-but-wrong     ${avg((r) => r.uncertainty.plausibleButWrong.length).toFixed(2)} per run (lower is safer)`);

  // usage + cost analytics
  const totals = sumUsage(usages);
  const grandTotal = totalTokens(totals);
  const { tier, usd } = estimateCostUSD(getModel(), totals);
  const totalMs = elapsedMs.reduce((a, b) => a + b, 0);
  const runsWithUsage = usages.filter(Boolean).length || 1;
  console.log(`\n================ USAGE & COST (${N} runs, model ${getModel()}) ================`);
  console.log(`tokens   input ${totals.inputTokens}  output ${totals.outputTokens}  cache-read ${totals.cacheReadTokens}  cache-write ${totals.cacheCreationTokens}  total ${grandTotal}`);
  console.log(`per run  input ${Math.round(totals.inputTokens / runsWithUsage)}  output ${Math.round(totals.outputTokens / runsWithUsage)}  (mean)`);
  console.log(`latency  mean ${(totalMs / N / 1000).toFixed(1)}s  total ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`est cost $${usd.toFixed(4)}  (~$${(usd / N).toFixed(4)}/run, ${tier} rates; see usage.ts PRICING — approximate)`);

  writeFileSync(
    join(outDir, 'summary.json'),
    JSON.stringify(
      {
        model: getModel(),
        runs: N,
        stability: { distinct: distinct.length, signatures },
        usage: { perRun: usages, elapsedMs, totals, totalTokens: grandTotal, estCostUSD: Number(usd.toFixed(4)), tier },
        reports,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${N} run file(s) + summary.json to ${outDir}`);
}

function ratioOf(n: number, d: number): number {
  return d === 0 ? 1 : n / d;
}

main().catch((err) => {
  console.error('\nHARNESS ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
