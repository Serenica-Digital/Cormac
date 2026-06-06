import { safeParseProposal, type Contract, type Proposal } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';

/**
 * The Agent Runtime Adapter (ADR-006). The control plane reaches the runtime
 * over HTTP and treats everything it returns as untrusted. This boundary does
 * two things: it carries tenant context IN, and it Zod-validates the SHAPE of
 * what comes back OUT. Contract-level validation (which fields may be written)
 * happens after this, in the pipeline. The runtime holds no database access.
 */

export interface RuntimeRecordSummary {
  objectApiName: string;
  id: string;
  display: Record<string, unknown>;
}

export interface RuntimeRequest {
  workspaceId: string;
  contract: Contract;
  text: string;
  records: RuntimeRecordSummary[];
}

export async function callRuntime(runtimeUrl: string, req: RuntimeRequest): Promise<Proposal> {
  let res: Response;
  try {
    res = await fetch(`${runtimeUrl}/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch (err) {
    throw new ProblemError(502, 'runtime_unreachable', 'Agent runtime is unreachable', String(err));
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ProblemError(502, 'runtime_error', `Agent runtime returned ${res.status}`, detail);
  }

  const body: unknown = await res.json().catch(() => null);
  const parsed = safeParseProposal(body);
  if (!parsed.success) {
    // Malformed output is rejected here and never reaches the database (ADR-006).
    throw new ProblemError(
      502,
      'runtime_invalid_output',
      'Agent runtime returned malformed output',
      parsed.error.message,
    );
  }
  return parsed.data;
}
