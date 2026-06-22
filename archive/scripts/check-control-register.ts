import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard for the control register: the meta-check that keeps the
 * claim -> control -> test chain from silently drifting. Runs without a database,
 * mirroring scripts/check-rls.ts. CI step `check:controls`.
 *
 * It asserts:
 *  1. Every test cited in the register's Test column exists on disk.
 *  2. Every `tested` / `enforced+tested` row cites at least one backticked test.
 *  3. Every *.test.ts in the repo is either cited by a row OR in QA_EXEMPT.
 *  4. Packet-doc links in the register resolve.
 * It FAILS LOUD: a test path written without backticks (which the parser would
 * otherwise skip) is an error, never a silent pass.
 *
 * What it does NOT prove (read green here as "the chain is wired", not "the
 * control is fully proven"): that a cited test actually exercises its control
 * (miscitation is a review job), or that the production auth path is covered
 * (local tests use HS256; production verifies ES256 against the JWKS, ADR-020).
 *
 * QA_EXEMPT POLICY (reviewer-policed, see control-register.md): an exemption is
 * ONLY for a test asserting correctness of non-compliance logic (a byte-stable
 * renderer, a pure classifier, a test-only stub fixture). A test that touches
 * auth, tenant isolation, audit, the write gate, or redaction must have a
 * register row, never an exemption. Each reason says why it is correctness-only
 * and points to where the real control is rowed.
 */
const QA_EXEMPT: { path: string; reason: string }[] = [
  {
    path: 'tests/integration/usage-telemetry.test.ts',
    reason:
      'Observability: persists run id + usage onto the source message. Touches no auth/isolation/audit/write-gate/redaction control.',
  },
  {
    path: 'tests/unit/render.test.ts',
    reason:
      'Correctness of byte-stable contract rendering; the control (only approved, no sensitive content reaches the prefix) is register rows 26 and 6 via context-compile.',
  },
  {
    path: 'tests/unit/glossary.test.ts',
    reason: 'Correctness of glossary parsing/dedup; the compiled-context control is register row 26.',
  },
  {
    path: 'tests/unit/propose.test.ts',
    reason: 'Test-only stub fixture for the runtime seam; not production code, enforces nothing.',
  },
  {
    path: 'apps/pane/src/auth/lanes.test.ts',
    reason:
      'Client-side sign-in lane UX (failure classification + availability); the pane enforces no auth, server-side identity/authz is register rows 9, 10, 27.',
  },
  {
    path: 'apps/pane/src/auth/storage.test.ts',
    reason: 'Client-side partition-keyed storage key correctness; no control.',
  },
  {
    path: 'apps/pane/src/probe/sse.test.ts',
    reason: 'Client-side SSE verdict classifier (incremental vs buffered), a measurement probe; no control.',
  },
];

const ROOT = process.cwd();
const REGISTER = 'docs/security/control-register.md';
const SECURITY_DIR = 'docs/security';
const errors: string[] = [];

// 1. Every *.test.ts in the repo (the orphan-detection set).
function findTests(): string[] {
  const skip = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage']);
  const out: string[] = [];
  const walk = (relDir: string): void => {
    for (const entry of readdirSync(join(ROOT, relDir), { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.test.ts')) out.push(rel);
    }
  };
  walk('');
  return out;
}
const repoTests = new Set(findTests());

// 2. Parse the Test and Packet-doc columns of the register table.
const lines = readFileSync(join(ROOT, REGISTER), 'utf8').split('\n');
const citedTests = new Set<string>();
let inRegister = false;

for (const line of lines) {
  if (line.startsWith('## Register')) {
    inRegister = true;
    continue;
  }
  if (inRegister && line.startsWith('## ')) break; // the table ends at the next section
  if (!inRegister) continue;

  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) continue;
  const cells = trimmed.split('|').map((c) => c.trim());
  // | # | Claim | Enforced by | Test | Packet doc | Status |
  const num = cells[1] ?? '';
  if (!num || num === '#' || /^-+$/.test(num)) continue; // header / separator
  const testCell = cells[4] ?? '';
  const packetCell = cells[5] ?? '';
  const statusCell = cells[6] ?? '';

  const backticked = [...testCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
  const citedInRow: string[] = [];
  for (const tok of backticked) {
    if (tok.includes('/') && tok.endsWith('.test.ts')) {
      citedInRow.push(tok);
      if (repoTests.has(tok)) citedTests.add(tok);
      else errors.push(`row ${num}: cited test does not exist: ${tok}`);
    }
  }

  // Fail loud: a path-shaped token outside backticks would be silently skipped.
  const stray = testCell.replace(/`[^`]+`/g, '').match(/[\w@./-]+\.test\.ts/);
  if (stray) {
    errors.push(`row ${num}: test path not in backticks (parser would skip it): ${stray[0]}`);
  }

  // A tested row must cite at least one existing test. The status vocabulary is
  // a fixed leading token (enforced / tested / enforced+tested / partial /
  // pending:<dep>); read it before any "(" note or ";" clause so prose like
  // "pending: tested drill" is not mistaken for a tested status.
  const statusHead = statusCell.split(/[(;]/)[0]!.trim();
  const isTested = statusHead === 'tested' || statusHead === 'enforced+tested';
  if (isTested && citedInRow.length === 0) {
    errors.push(`row ${num}: status "${statusCell}" claims tested but cites no backticked test path`);
  }

  // Packet-doc links resolve.
  for (const m of packetCell.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = m[1]!;
    if (target.endsWith('.md') && !existsSync(join(ROOT, SECURITY_DIR, target))) {
      errors.push(`row ${num}: packet doc link broken: ${target}`);
    }
  }
}

// 3. Orphans: every repo test is cited or exempt.
const exemptPaths = new Set(QA_EXEMPT.map((e) => e.path));
for (const t of repoTests) {
  if (!citedTests.has(t) && !exemptPaths.has(t)) {
    errors.push(`orphan test (not cited in the register, not QA_EXEMPT): ${t}`);
  }
}

// 4. The exempt list cannot rot.
for (const e of QA_EXEMPT) {
  if (!repoTests.has(e.path)) errors.push(`QA_EXEMPT names a missing test: ${e.path}`);
  if (citedTests.has(e.path)) errors.push(`QA_EXEMPT test is also cited in the register (pick one): ${e.path}`);
  if (!e.reason.trim()) errors.push(`QA_EXEMPT entry needs a reason: ${e.path}`);
}

if (errors.length > 0) {
  console.error(`Control-register check FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `Control-register check: ${repoTests.size} tests (${citedTests.size} cited, ${QA_EXEMPT.length} exempt), chain intact.`,
);
