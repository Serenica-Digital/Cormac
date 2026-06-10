import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseContract, type Contract } from '@serenica/contract';
import { runAgent, getModel, type AgentRun, type TokenUsage } from './agent.js';
import { score, type ScoreReport } from './score.js';
import type { AuthoringOutput } from './authoring-schema.js';
import { sumUsage, totalTokens, estimateCostUSD } from './usage.js';
import { CASES, type WorkbookCase } from './cases.js';

/**
 * Workbook Contract Agent graded eval (ADR-023). Runs every fixture in the
 * corpus N times, scores each run against its golden, and reports per-dimension
 * scorecards, plausible-but-wrong lists, uncertainty recall, decision stability,
 * and total usage. A low score is data, not a test failure: this exits non-zero
 * only on a harness error (a missing or invalid golden, or no successful run).
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
const N = Number(process.env.SPIKE_RUNS ?? '3');

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const ratioOf = (n: number, d: number): number => (d === 0 ? 1 : n / d);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function printReport(i: number, run: AgentRun, r: ScoreReport): void {
  console.log(`\n---------------- run ${i + 1}/${N}  (${run.model}) ----------------`);
  console.log(`validity (parseContract): ${r.validity.ok ? 'OK' : `FAILED — ${r.validity.error}`}`);
  console.log(`objects   recall ${pct(r.objectCoverage.recall)}  precision ${pct(r.objectCoverage.precision)}  (matched ${r.objectCoverage.matched}/${r.objectCoverage.golden}${r.objectCoverage.extra.length ? `, extra: ${r.objectCoverage.extra.join(',')}` : ''})`);
  console.log(`fields    recall ${pct(r.fieldCoverage.recall)}  precision ${pct(r.fieldCoverage.precision)}  (matched ${r.fieldCoverage.matched}/${r.fieldCoverage.golden})`);
  console.log(`types     ${r.typeCorrectness.correct}/${r.typeCorrectness.total}   enums ${r.enumCapture.ok}/${r.enumCapture.total}`);
  console.log(`identity  ${r.identity.correct}/${r.identity.total}   relationships ${r.relationships.found}/${r.relationships.expected}   [HIGH-STAKES]`);
  console.log(`agent-write ${r.agentWrite.match}/${r.agentWrite.total} match, ${r.agentWrite.trustMisses.length} trust-miss   sensitive ${r.sensitive.match}/${r.sensitive.total}   aliases ${r.aliases.captured}/${r.aliases.total}   [HIGH-STAKES]`);

  const diffs = [
    ...r.identity.details.map((d) => `  identity   ${d}`),
    ...r.relationships.details.map((d) => `  relation   ${d}`),
    ...r.agentWrite.trustMisses.map((d) => `  TRUST      ${d}`),
    ...r.typeCorrectness.mismatches.map((d) => `  type       ${d}`),
    ...r.fieldCoverage.missed.map((d) => `  missed     ${d}`),
  ];
  if (diffs.length) {
    console.log('  --- diffs ---');
    for (const l of diffs) console.log(l);
  }
  console.log(`  uncertainty recall ${pct(r.uncertainty.recall)} (critical ${r.uncertainty.criticalFlagged}/${r.uncertainty.criticalTotal})`);
  if (r.uncertainty.plausibleButWrong.length) {
    console.log('  --- PLAUSIBLE-BUT-WRONG (critical, unflagged) ---');
    for (const issue of r.uncertainty.plausibleButWrong) console.log(`  !! [${issue.dimension}] ${issue.detail}`);
  }
  if (run.usage) console.log(`  usage: in ${run.usage.inputTokens} out ${run.usage.outputTokens}`);
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

function printCaseSummary(reports: ScoreReport[], signatures: string[]): void {
  const distinct = [...new Set(signatures)];
  console.log(`\n  stability: ${distinct.length === 1 ? 'STABLE across runs' : `${distinct.length} distinct structural variants`}`);
  if (distinct.length > 1) distinct.forEach((s, i) => console.log(`    variant ${i + 1} (${signatures.filter((x) => x === s).length}x): ${s}`));

  const avg = (f: (r: ScoreReport) => number): number => reports.reduce((s, r) => s + f(r), 0) / reports.length;
  console.log(`  aggregate (mean of ${reports.length}): valid ${pct(avg((r) => (r.validity.ok ? 1 : 0)))}  field-recall ${pct(avg((r) => r.fieldCoverage.recall))}  identity ${pct(avg((r) => ratioOf(r.identity.correct, r.identity.total)))}  rel ${pct(avg((r) => ratioOf(r.relationships.found, r.relationships.expected)))}  trust-miss ${avg((r) => r.agentWrite.trustMisses.length).toFixed(2)}/run  unflagged-critical ${avg((r) => r.uncertainty.plausibleButWrong.length).toFixed(2)}/run`);
}

interface LoadedCase {
  def: WorkbookCase;
  golden: Contract;
  detected: unknown;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set (put it in .env). Run: pnpm evals:workbook');
    process.exit(1);
  }

  // Fail fast: load and validate every golden + fixture before spending any API call.
  const loaded: LoadedCase[] = CASES.map((def) => ({
    def,
    golden: parseContract(JSON.parse(readFileSync(join(here, def.golden), 'utf8'))),
    detected: JSON.parse(readFileSync(join(here, def.detected), 'utf8')),
  }));

  mkdirSync(outDir, { recursive: true });
  console.log(`Workbook Contract Agent eval — model ${getModel()}, ${N} run(s), ${loaded.length} fixture(s)`);

  const allUsages: Array<TokenUsage | null> = [];
  const allElapsed: number[] = [];
  const summary: Array<{ name: string; reports: ScoreReport[]; signatures: string[] }> = [];

  for (const { def, golden, detected } of loaded) {
    const fieldCount = golden.objects.reduce((n, o) => n + o.fields.length, 0);
    console.log(`\n################ ${def.name} ################`);
    console.log(`golden: ${golden.objects.length} objects, ${fieldCount} fields`);

    const reports: ScoreReport[] = [];
    const signatures: string[] = [];
    for (let i = 0; i < N; i++) {
      const t0 = Date.now();
      const run = await runAgent(detected);
      allElapsed.push(Date.now() - t0);
      allUsages.push(run.usage);
      const r = score(golden, run.rawOutput, run.contractError);
      reports.push(r);
      signatures.push(stabilitySignature(run.rawOutput));
      printReport(i, run, r);
      writeFileSync(
        join(outDir, `${slug(def.name)}.run-${i + 1}.json`),
        JSON.stringify({ fixture: def.name, model: run.model, usage: run.usage, rawOutput: run.rawOutput, contract: run.contract, contractError: run.contractError, score: r }, null, 2),
      );
    }
    printCaseSummary(reports, signatures);
    summary.push({ name: def.name, reports, signatures });
  }

  // global usage + cost
  const totals = sumUsage(allUsages);
  const { tier, usd } = estimateCostUSD(getModel(), totals);
  const totalMs = allElapsed.reduce((a, b) => a + b, 0);
  console.log(`\n################ USAGE & COST (${loaded.length} fixtures x ${N} runs) ################`);
  console.log(`tokens  input ${totals.inputTokens}  output ${totals.outputTokens}  total ${totalTokens(totals)}`);
  console.log(`latency mean ${(totalMs / allElapsed.length / 1000).toFixed(1)}s  total ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`est cost $${usd.toFixed(4)} (${tier} rates, approximate)`);

  writeFileSync(
    join(outDir, 'summary.json'),
    JSON.stringify({ model: getModel(), runs: N, usage: { totals, totalTokens: totalTokens(totals), estCostUSD: Number(usd.toFixed(4)), tier }, fixtures: summary }, null, 2),
  );
  console.log(`\nwrote per-run files + summary.json to ${outDir}`);
}

main().catch((err) => {
  console.error('\nHARNESS ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
