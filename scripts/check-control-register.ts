import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Static guard for the control register (docs/security/control-register.md):
 * the meta-check that keeps the claim -> control -> test chain from silently
 * drifting. Ported from v0 (archive/scripts/check-control-register.ts) and
 * adapted to the v2 legend. Run manually: `pnpm check:controls` (no CI this
 * round by decision).
 *
 * It asserts:
 *  1. Every backticked test path cited in the register exists on disk.
 *  2. Every `Verified` row cites at least one backticked test path - manual
 *     or config-review evidence caps a row at Partial by definition.
 *  3. A path-shaped token in the Test column that is not backticked is an
 *     error, never a silent skip.
 *  4. Every *.test.ts / *.test.tsx in the repo is cited by a row or listed in
 *     QA_EXEMPT with a reason; stale exemptions (file gone) are errors too.
 *  5. Packet-doc links in the register resolve.
 *
 * What it does NOT prove: that a cited test actually exercises its claimed
 * control (miscitation is a review job), or production-path coverage (local
 * tests exercise the HS256 branch; staging+ verifies ES256 via the JWKS).
 * Read green as "the chain is wired", not "the control is fully proven".
 *
 * QA_EXEMPT POLICY (reviewer-policed): an exemption is ONLY for a test that
 * asserts correctness of non-compliance logic (a parser, presentation-layer
 * gating whose real control is a rowed server test, a pure classifier). A
 * test that touches server-side auth, tenant isolation, audit, the write
 * gate, or redaction must have a register row, never an exemption. Each
 * reason says why it is correctness-only and where the real control is rowed.
 */
const QA_EXEMPT: { path: string; reason: string }[] = [
  {
    path: 'apps/web/tests/detect.test.ts',
    reason:
      'Correctness of in-browser workbook shape detection; the data-handling posture (what leaves the browser) is register row 26.',
  },
  {
    path: 'apps/web/tests/mapImport.test.ts',
    reason:
      'Correctness of in-browser workbook->records mapping and type coercion; the enforced write gate is register row 27 (commit endpoint) and the data boundary is row 26.',
  },
  {
    path: 'apps/web/tests/nav.test.ts',
    reason:
      'Presentation: role/stage-gated navigation copy. The enforced controls are server-side authz, rows 8-11.',
  },
  {
    path: 'apps/web/tests/authz.test.ts',
    reason:
      'Presentation vocabulary (role labels, read_only display floor). Server-side authz is rows 8-11.',
  },
  {
    path: 'apps/web/tests/members.test.tsx',
    reason:
      'Presentation: the People page mirrors server rules in UI. The enforced invariants are rows 9-10 (membership suite).',
  },
  {
    path: 'apps/web/tests/attention.test.ts',
    reason:
      'Presentation: pure client-side "needs you" classification from semantic tags. It reads records the user can already see; writes stay behind rows 5-7 and 27.',
  },
  {
    path: 'packages/contract/tests/semantic.test.ts',
    reason:
      'Correctness of the contract meta-schema (semantic tag shape/type guard). The write gate that enforces contracts is rows 5-7; semantics grant no write ability.',
  },
];

const ROOT = join(import.meta.dirname, '..');
const REGISTER = join(ROOT, 'docs/security/control-register.md');

function findTests(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'archive' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findTests(full, out);
    else if (/\.test\.tsx?$/.test(entry)) out.push(relative(ROOT, full));
  }
  return out;
}

const errors: string[] = [];
const register = readFileSync(REGISTER, 'utf8');

// Table rows: skip the header and the separator.
const rows = register
  .split('\n')
  .filter((l) => /^\|\s*\d+\s*\|/.test(l))
  .map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    // ['', '#', 'Claim', 'Enforced by', 'Test', 'Packet doc', 'Status', '']
    return { num: cells[1]!, claim: cells[2]!, test: cells[4]!, doc: cells[5]!, status: cells[6]! };
  });

if (rows.length === 0) errors.push('no register rows parsed - table format changed?');

const cited = new Set<string>();
for (const row of rows) {
  const backticked = [...row.test.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
  const testPaths = backticked.filter((p) => /\.test\.tsx?$/.test(p));
  for (const p of testPaths) {
    cited.add(p);
    if (!existsSync(join(ROOT, p))) errors.push(`row ${row.num}: cited test does not exist: ${p}`);
  }

  // Path-shaped tokens outside backticks would silently evade the parser.
  const stripped = row.test.replaceAll(/`[^`]+`/g, '');
  const bare = stripped.match(/[\w./-]+\.test\.tsx?/);
  if (bare) errors.push(`row ${row.num}: test path not backticked (guard cannot track it): ${bare[0]}`);

  if (/^Verified/i.test(row.status) && testPaths.length === 0) {
    errors.push(
      `row ${row.num} ("${row.claim}") is Verified but cites no test file - manual evidence caps at Partial`,
    );
  }

  for (const [, target] of row.doc.matchAll(/\]\(([^)]+)\)/g)) {
    if (!existsSync(join(ROOT, 'docs/security', target!))) {
      errors.push(`row ${row.num}: packet doc link does not resolve: ${target}`);
    }
  }
}

const exempt = new Map(QA_EXEMPT.map((e) => [e.path, e.reason]));
for (const [path] of exempt) {
  if (!existsSync(join(ROOT, path))) errors.push(`stale exemption (file gone): ${path}`);
  if (cited.has(path)) errors.push(`${path} is both cited and exempted - pick one`);
}

for (const test of findTests(ROOT)) {
  if (!cited.has(test) && !exempt.has(test)) {
    errors.push(`test neither cited by a register row nor exempted: ${test}`);
  }
}

if (errors.length > 0) {
  console.error(`check-control-register: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `check-control-register: OK (${rows.length} rows, ${cited.size} cited tests, ${QA_EXEMPT.length} exemptions)`,
);
