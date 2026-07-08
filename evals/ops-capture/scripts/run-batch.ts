import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { SignJWT } from 'jose';

/**
 * Drive the fixed utterance protocol through the real capture path:
 * POST /api/workspaces/:id/capture as the seeded owner, one utterance at a
 * time, and record what came back. The harness measures and records; the
 * human judges against utterances.json's expectations.
 *
 * Wall time here is the whole product path (control plane -> /v1/runs ->
 * agent loop with tool callbacks -> proposal held -> response). Tool-call
 * counts and the cache split come from the gateway log, not from here.
 *
 * Usage (env via infisical run --env=dev; the control plane must be up):
 *   pnpm ops:batch -- --label dev-smoke [--only clean-create,update-by-name]
 * Reads the seed manifest from .jarvis/tmp/notes/ops-runs/seed.json.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const label = arg('label') ?? 'unlabeled';
const only = arg('only')?.split(',').map((s) => s.trim());

const controlPlane = (process.env.CORMAC_CONTROL_PLANE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
if (!jwtSecret || !supabaseUrl) {
  console.error('SUPABASE_JWT_SECRET / SUPABASE_URL unset; run under `infisical run --env=dev`.');
  console.error('(The batch drives the dev HS256 path; it is not a staging-database tool.)');
  process.exit(2);
}

const repoRoot = new URL('../../../', import.meta.url).pathname;
const manifest = JSON.parse(
  readFileSync(repoRoot + '.jarvis/tmp/notes/ops-runs/seed.json', 'utf8'),
) as { workspaceId: string; userId: string };
const { workspaceId, userId } = manifest;

const protocol = JSON.parse(readFileSync(repoRoot + 'evals/ops-capture/utterances.json', 'utf8')) as {
  utterances: { id: string; text: string; expect: string }[];
};
const utterances = protocol.utterances.filter((u) => !only || only.includes(u.id));
if (!utterances.length) {
  console.error(`--only matched nothing (${only?.join(',')})`);
  process.exit(2);
}

// Owner JWT, same shape as scripts/dev-owner-jwt.ts.
const token = await new SignJWT({})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(process.env.SUPABASE_AUTH_ISSUER ?? `${supabaseUrl}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(userId)
  .setExpirationTime('4h')
  .sign(new TextEncoder().encode(jwtSecret));

interface RunRecord {
  id: string;
  text: string;
  expect: string;
  wallMs: number;
  httpStatus: number;
  status?: string;
  proposalId?: string | null;
  changeCount?: number;
  uncertain?: boolean;
  agentNote?: string;
  payload?: unknown;
  error?: unknown;
}

const results: RunRecord[] = [];
for (const utterance of utterances) {
  process.stderr.write(`>> ${utterance.id}: ${utterance.text}\n`);
  const started = Date.now();
  let record: RunRecord;
  try {
    const res = await fetch(`${controlPlane}/api/workspaces/${workspaceId}/capture`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: utterance.text }),
      signal: AbortSignal.timeout(600_000),
    });
    const body = (await res.json()) as Record<string, unknown>;
    record = {
      id: utterance.id,
      text: utterance.text,
      expect: utterance.expect,
      wallMs: Date.now() - started,
      httpStatus: res.status,
      ...(res.ok
        ? {
            status: body.status as string,
            proposalId: (body.proposalId as string | null) ?? null,
            changeCount: body.changeCount as number,
            uncertain: body.uncertain as boolean,
            agentNote: body.agentNote as string | undefined,
          }
        : { error: body }),
    };
    // Pull the held payload so the judge sees the actual changes.
    if (res.ok && body.proposalId) {
      const proposals = await fetch(
        `${controlPlane}/api/workspaces/${workspaceId}/proposals?status=pending`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (proposals.ok) {
        const list = (await proposals.json()) as { proposals: { id: string; payload?: unknown; changes?: unknown }[] };
        record.payload = list.proposals.find((p) => p.id === body.proposalId);
      }
    }
  } catch (err) {
    record = {
      id: utterance.id,
      text: utterance.text,
      expect: utterance.expect,
      wallMs: Date.now() - started,
      httpStatus: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  results.push(record);
  process.stderr.write(
    `   ${record.httpStatus} ${record.status ?? 'ERROR'} in ${(record.wallMs / 1000).toFixed(1)}s` +
      (record.changeCount ? `, ${record.changeCount} change(s)` : '') +
      (record.uncertain ? ', uncertain' : '') +
      '\n',
  );
}

const outDir = repoRoot + '.jarvis/tmp/notes/ops-runs/';
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = `${outDir}${label}-${stamp}.json`;
writeFileSync(outPath, JSON.stringify({ label, controlPlane, workspaceId, results }, null, 2));
console.log(JSON.stringify({ label, ran: results.length, out: outPath }, null, 2));
