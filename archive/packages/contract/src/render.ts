import { createHash } from 'node:crypto';
import type { Contract } from './contract.js';
import { getObject } from './contract.js';
import { buildContextDisplay } from './redact.js';

/**
 * The compiled workspace-context block (ADR-027 section 3). The control plane
 * renders a workspace's governed knowledge — contract, glossary, applicable
 * learned knowledge — into one deterministic text block delivered as the
 * runtime's cached prompt prefix.
 *
 * Byte-stability is the whole point. A block that is identical between publishes
 * is read from cache across runs; any per-run variance silently busts the cache
 * (measured: #46). So this function is pure and order-independent. It carries no
 * clock, no UUID, and no dependence on input array order: everything is sorted
 * by Unicode codepoint (never localeCompare, whose result is locale-dependent).
 *
 * It is also a trust boundary. Glossary text, alias variants, and record
 * displays can carry third-party content (inbound SMS and email), so every value
 * is flattened to a single inert line before it enters the prompt; an injected
 * newline or code fence becomes literal characters, never structure. Sensitive
 * record values never appear: alias displays go through buildContextDisplay, the
 * same minimization the matching path already uses.
 */

/** A learned item resolved for rendering. The control plane assembles these. */
export interface AliasLearnedView {
  kind: 'alias';
  objectApiName: string;
  variant: string;
  /** The resolved record, or null when missing/archived (renders nothing). */
  record: { data: Record<string, unknown> } | null;
}
export interface EnumSynonymLearnedView {
  kind: 'enum_synonym';
  objectApiName: string;
  fieldApiName: string;
  synonym: string;
  canonicalOption: string;
}
export type LearnedView = AliasLearnedView | EnumSynonymLearnedView;

/** Collapse all whitespace, including injected newlines, to single spaces. */
function inert(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function renderContract(contract: Contract): string[] {
  const lines: string[] = [`== CONTRACT: ${inert(contract.name)} (v${contract.version}) ==`];
  const objects = [...contract.objects].sort((a, b) => byCodepoint(a.apiName, b.apiName));
  for (const obj of objects) {
    lines.push(`Object: ${inert(obj.label)} (api: ${obj.apiName})`);
    lines.push(`  Identity match fields: ${obj.identity.displayFields.join(', ')}`);
    lines.push('  Fields:');
    const fields = [...obj.fields].sort((a, b) => byCodepoint(a.apiName, b.apiName));
    for (const f of fields) {
      const bits: string[] = [f.type];
      // Enum options keep contract order (it is intrinsic, not input shuffle).
      if (f.type === 'enum' && f.enumOptions?.length) {
        bits.push(`options: ${f.enumOptions.map(inert).join('|')}`);
      }
      if (f.required) bits.push('required');
      if (f.sensitive) bits.push('sensitive');
      bits.push(f.editableByAgent ? 'agent-editable' : 'human-only');
      lines.push(`    - ${f.apiName} (${inert(f.label)}) [${bits.join('; ')}]`);
    }
    // Contract-level aliases are vocabulary synonyms, distinct from learned
    // record aliases (stratum 3). Both render; the labels keep them apart.
    if (obj.aliases.length) {
      lines.push('  Vocabulary aliases:');
      const aliases = [...obj.aliases].sort((a, b) => byCodepoint(a.canonical, b.canonical));
      for (const a of aliases) {
        const variants = [...a.variants].map(inert).sort(byCodepoint).join(', ');
        lines.push(`    - ${inert(a.canonical)} <- ${variants}`);
      }
    }
  }
  return lines;
}

function scopeKey(objectApiName?: string, fieldApiName?: string): string {
  if (!objectApiName) return '';
  return fieldApiName ? `${objectApiName}.${fieldApiName}` : objectApiName;
}

function renderGlossary(contract: Contract): string[] {
  if (!contract.glossary.length) return ['== GLOSSARY ==', '(none)'];
  const entries = [...contract.glossary].sort(
    (a, b) =>
      byCodepoint(
        scopeKey(a.appliesTo?.objectApiName, a.appliesTo?.fieldApiName),
        scopeKey(b.appliesTo?.objectApiName, b.appliesTo?.fieldApiName),
      ) ||
      byCodepoint(a.term.toLowerCase(), b.term.toLowerCase()) ||
      byCodepoint(a.entryId, b.entryId),
  );
  const lines: string[] = ['== GLOSSARY =='];
  for (const e of entries) {
    const key = scopeKey(e.appliesTo?.objectApiName, e.appliesTo?.fieldApiName);
    const scope = key ? ` (${key})` : '';
    lines.push(`  - ${inert(e.term)}${scope}: ${inert(e.definition)}`);
  }
  return lines;
}

function renderLearned(contract: Contract, learned: LearnedView[]): string[] {
  const rendered: string[] = [];
  for (const item of learned) {
    if (item.kind === 'alias') {
      if (!item.record) continue; // missing or archived record renders nothing
      const object = getObject(contract, item.objectApiName);
      if (!object) continue;
      const display = buildContextDisplay(object, item.record.data);
      const text = Object.values(display)
        .filter((v) => v != null && v !== '')
        .map((v) => inert(String(v)))
        .join(' ');
      if (!text) continue;
      rendered.push(`  - alias: "${inert(item.variant)}" -> ${text} (${item.objectApiName})`);
    } else {
      rendered.push(
        `  - enum synonym: "${inert(item.synonym)}" -> ${inert(item.canonicalOption)} ` +
          `(${item.objectApiName}.${item.fieldApiName})`,
      );
    }
  }
  if (!rendered.length) return ['== LEARNED KNOWLEDGE ==', '(none)'];
  // Sort the fully-rendered lines so DB row order never changes the bytes.
  rendered.sort(byCodepoint);
  return ['== LEARNED KNOWLEDGE ==', ...rendered];
}

export function renderWorkspaceContext(contract: Contract, learned: LearnedView[] = []): string {
  const blocks = [
    'WORKSPACE CONTEXT (authoritative; the full active contract, glossary, and learned knowledge follow).',
    '',
    ...renderContract(contract),
    '',
    ...renderGlossary(contract),
    '',
    ...renderLearned(contract, learned),
  ];
  return blocks.join('\n') + '\n';
}

export function hashWorkspaceContext(contract: Contract, learned: LearnedView[] = []): string {
  return createHash('sha256').update(renderWorkspaceContext(contract, learned)).digest('hex');
}
