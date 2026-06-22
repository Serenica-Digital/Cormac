import type { Contract } from '@cormac/contract';
import type { AuthoringOutput } from './authoring-schema.js';

/**
 * Scores one agent run against the golden contract, dimension by dimension. No
 * single blended number: the point is to see *where* the agent is right and,
 * more importantly, where it is confidently wrong (ADR-023 §5). Field matching
 * is meaning-based (normalized labels, source columns, and a small synonym map),
 * because different fields demand different notions of correctness.
 */

// ---------- normalized intermediate view (golden and generated share it) ----------

interface SField {
  apiName: string;
  label: string;
  type: string;
  editableByAgent: boolean;
  sensitive: boolean;
  enumOptions?: string[];
  relationshipTargetType?: string;
  sourceColumn?: string;
}
interface SObject {
  apiName: string;
  label: string;
  fields: SField[];
  identityFields: string[];
  aliasVariants: string[];
}

function fromGolden(c: Contract): SObject[] {
  return c.objects.map((o) => ({
    apiName: o.apiName,
    label: o.label,
    identityFields: o.identity.displayFields,
    aliasVariants: o.aliases.flatMap((a) => a.variants),
    fields: o.fields.map((f) => ({
      apiName: f.apiName,
      label: f.label,
      type: f.type,
      editableByAgent: f.editableByAgent,
      sensitive: f.sensitive,
      enumOptions: f.enumOptions,
      relationshipTargetType: f.relationshipTargetType,
      sourceColumn: f.excelColumn,
    })),
  }));
}

function fromAgent(out: AuthoringOutput): SObject[] {
  return out.objects.map((o) => ({
    apiName: o.apiName,
    label: o.label,
    identityFields: o.identityDisplayFields,
    aliasVariants: o.aliases.flatMap((a) => a.variants),
    fields: o.fields.map((f) => ({
      apiName: f.apiName,
      label: f.label,
      type: f.type,
      editableByAgent: f.editableByAgent,
      sensitive: f.sensitive,
      enumOptions: f.enumOptions,
      relationshipTargetType: f.relationshipTargetType,
      sourceColumn: f.sourceColumn,
    })),
  }));
}

// ---------- normalization + synonyms ----------

const norm = (s: string | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const FIELD_SYNONYMS: string[][] = [
  ['name', 'fullname', 'clientname', 'contactname'],
  ['email', 'emailaddress', 'mail'],
  ['cell', 'phone', 'mobile', 'cellphone', 'phonenumber', 'tel'],
  ['notes', 'note', 'comments', 'comment'],
  ['priority', 'rating', 'internalrating', 'hotness', 'score'],
  ['address', 'propertyaddress', 'property'],
  ['price', 'listprice', 'askingprice'],
  ['closedate', 'closingdate', 'close'],
  ['client', 'contact', 'customer', 'buyer'],
];

const OBJECT_SYNONYMS: string[][] = [
  ['person', 'people', 'client', 'clients', 'contact', 'contacts', 'customer', 'customers', 'lead', 'leads'],
  ['deal', 'deals', 'listing', 'listings', 'property', 'properties', 'transaction', 'transactions'],
];

function sameGroup(a: string, b: string, groups: string[][]): boolean {
  if (a && a === b) return true;
  return groups.some((g) => g.includes(a) && g.includes(b));
}

// ---------- matching ----------

interface FieldPair {
  golden: SField;
  gen: SField;
}
interface ObjectMatch {
  golden: SObject;
  gen: SObject;
  pairs: FieldPair[];
  missedFields: SField[];
  extraFields: SField[];
}

function matchObjects(golden: SObject[], gen: SObject[]) {
  const usedGen = new Set<number>();
  const matches: ObjectMatch[] = [];
  const missedObjects: SObject[] = [];

  for (const g of golden) {
    const keys = [norm(g.apiName), norm(g.label), ...g.aliasVariants.map(norm)];
    const idx = gen.findIndex((cand, i) => {
      if (usedGen.has(i)) return false;
      const candKeys = [norm(cand.apiName), norm(cand.label), ...cand.aliasVariants.map(norm)];
      return keys.some((k) => candKeys.some((ck) => sameGroup(k, ck, OBJECT_SYNONYMS)));
    });
    if (idx === -1) {
      missedObjects.push(g);
    } else {
      usedGen.add(idx);
      matches.push(buildObjectMatch(g, gen[idx]!));
    }
  }
  const extraObjects = gen.filter((_, i) => !usedGen.has(i));
  return { matches, missedObjects, extraObjects };
}

function fieldMatches(g: SField, c: SField): boolean {
  if (g.sourceColumn && c.sourceColumn && norm(g.sourceColumn) === norm(c.sourceColumn)) return true;
  const gk = [norm(g.apiName), norm(g.label)];
  const ck = [norm(c.apiName), norm(c.label)];
  return gk.some((a) => ck.some((b) => sameGroup(a, b, FIELD_SYNONYMS)));
}

function buildObjectMatch(golden: SObject, gen: SObject): ObjectMatch {
  const usedGen = new Set<number>();
  const pairs: FieldPair[] = [];
  const missedFields: SField[] = [];
  for (const gf of golden.fields) {
    const idx = gen.fields.findIndex((cf, i) => !usedGen.has(i) && fieldMatches(gf, cf));
    if (idx === -1) missedFields.push(gf);
    else {
      usedGen.add(idx);
      pairs.push({ golden: gf, gen: gen.fields[idx]! });
    }
  }
  const extraFields = gen.fields.filter((_, i) => !usedGen.has(i));
  return { golden, gen, pairs, missedFields, extraFields };
}

// ---------- issues + report ----------

export type Severity = 'CRITICAL' | 'WARN';
export interface Issue {
  dimension: string;
  severity: Severity;
  object?: string;
  field?: string;
  detail: string;
  keywords: string[];
  flagged?: boolean;
}

export interface ScoreReport {
  validity: { ok: boolean; error: string | null };
  objectCoverage: { precision: number; recall: number; matched: number; golden: number; generated: number; missed: string[]; extra: string[] };
  fieldCoverage: { precision: number; recall: number; matched: number; golden: number; generated: number; missed: string[]; extra: string[] };
  typeCorrectness: { correct: number; total: number; mismatches: string[] };
  enumCapture: { ok: number; total: number; details: string[] };
  identity: { correct: number; total: number; details: string[] };
  relationships: { found: number; expected: number; details: string[] };
  agentWrite: { match: number; total: number; trustMisses: string[]; mismatches: string[] };
  sensitive: { match: number; total: number; misses: string[] };
  aliases: { captured: number; total: number; details: string[] };
  uncertainty: {
    totalIssues: number;
    flagged: number;
    recall: number;
    criticalTotal: number;
    criticalFlagged: number;
    criticalRecall: number;
    plausibleButWrong: Issue[];
  };
  issues: Issue[];
}

const ratio = (n: number, d: number): number => (d === 0 ? 1 : n / d);

export function score(
  golden: Contract,
  rawOutput: AuthoringOutput,
  contractError: string | null,
): ScoreReport {
  const G = fromGolden(golden);
  const A = fromAgent(rawOutput);
  const { matches, missedObjects, extraObjects } = matchObjects(G, A);
  const issues: Issue[] = [];

  // map generated object apiName -> golden object apiName, for relationship-target checks
  const genToGoldenObj = new Map<string, string>();
  for (const m of matches) genToGoldenObj.set(norm(m.gen.apiName), m.golden.apiName);

  // object coverage
  for (const o of missedObjects)
    issues.push({ dimension: 'object-coverage', severity: 'CRITICAL', object: o.apiName, detail: `missed object "${o.apiName}"`, keywords: [o.apiName, o.label] });
  for (const o of extraObjects)
    issues.push({ dimension: 'object-coverage', severity: 'WARN', object: o.apiName, detail: `extra object "${o.apiName}" (possible over-creation)`, keywords: [o.apiName, o.label] });

  // field-level dimensions, over matched objects
  let fGolden = 0, fGen = 0, fMatched = 0;
  const fMissed: string[] = [], fExtra: string[] = [];
  let typeCorrect = 0, typeTotal = 0; const typeMismatch: string[] = [];
  let enumOk = 0, enumTotal = 0; const enumDetails: string[] = [];
  let awMatch = 0, awTotal = 0; const awTrust: string[] = [], awMis: string[] = [];
  let senMatch = 0, senTotal = 0; const senMiss: string[] = [];

  for (const m of matches) {
    fGolden += m.golden.fields.length;
    fGen += m.gen.fields.length;
    fMatched += m.pairs.length;
    for (const f of m.missedFields) {
      fMissed.push(`${m.golden.apiName}.${f.apiName}`);
      issues.push({ dimension: 'field-coverage', severity: 'WARN', object: m.golden.apiName, field: f.apiName, detail: `missed field "${m.golden.apiName}.${f.apiName}"`, keywords: [f.apiName, f.label, f.sourceColumn ?? ''] });
    }
    for (const f of m.extraFields) fExtra.push(`${m.gen.apiName}.${f.apiName}`);

    for (const p of m.pairs) {
      const key = `${m.golden.apiName}.${p.golden.apiName}`;
      const kw = [p.golden.apiName, p.golden.label, p.golden.sourceColumn ?? '', m.golden.apiName];

      // type
      typeTotal += 1;
      if (norm(p.golden.type) === norm(p.gen.type)) typeCorrect += 1;
      else {
        typeMismatch.push(`${key}: golden=${p.golden.type} gen=${p.gen.type}`);
        issues.push({ dimension: 'type', severity: 'WARN', object: m.golden.apiName, field: p.golden.apiName, detail: `type golden=${p.golden.type} gen=${p.gen.type}`, keywords: kw });
      }

      // enum capture (for golden enum fields)
      if (p.golden.type === 'enum') {
        enumTotal += 1;
        const goldenOpts = new Set((p.golden.enumOptions ?? []).map(norm));
        const genOpts = new Set((p.gen.enumOptions ?? []).map(norm));
        const overlap = [...goldenOpts].filter((x) => genOpts.has(x)).length;
        const full = p.gen.type === 'enum' && overlap === goldenOpts.size && genOpts.size === goldenOpts.size;
        if (full) enumOk += 1;
        else {
          enumDetails.push(`${key}: golden=[${[...goldenOpts].join(',')}] gen=${p.gen.type === 'enum' ? `[${[...genOpts].join(',')}]` : `(type ${p.gen.type})`}`);
          issues.push({ dimension: 'enum', severity: 'WARN', object: m.golden.apiName, field: p.golden.apiName, detail: `enum options differ`, keywords: kw });
        }
      }

      // agent-write flag (trust)
      awTotal += 1;
      if (p.golden.editableByAgent === p.gen.editableByAgent) awMatch += 1;
      else {
        const trustMiss = p.golden.editableByAgent === false && p.gen.editableByAgent === true;
        const line = `${key}: golden=${p.golden.editableByAgent} gen=${p.gen.editableByAgent}${trustMiss ? '  <-- TRUST MISS' : ''}`;
        if (trustMiss) awTrust.push(line);
        else awMis.push(line);
        issues.push({ dimension: 'agent-write', severity: trustMiss ? 'CRITICAL' : 'WARN', object: m.golden.apiName, field: p.golden.apiName, detail: `editableByAgent golden=${p.golden.editableByAgent} gen=${p.gen.editableByAgent}`, keywords: kw });
      }

      // sensitive / PII
      senTotal += 1;
      if (p.golden.sensitive === p.gen.sensitive) senMatch += 1;
      else {
        const miss = p.golden.sensitive === true && p.gen.sensitive === false;
        senMiss.push(`${key}: golden=${p.golden.sensitive} gen=${p.gen.sensitive}`);
        issues.push({ dimension: 'sensitive', severity: miss ? 'WARN' : 'WARN', object: m.golden.apiName, field: p.golden.apiName, detail: `sensitive golden=${p.golden.sensitive} gen=${p.gen.sensitive}`, keywords: kw });
      }
    }
  }

  // identity (high-stakes), per matched object, mapping gen field names to golden via pairs
  let idCorrect = 0; const idDetails: string[] = [];
  for (const m of matches) {
    const genToGoldenField = new Map<string, string>();
    for (const p of m.pairs) genToGoldenField.set(norm(p.gen.apiName), p.golden.apiName);
    const genId = new Set(m.gen.identityFields.map((f) => genToGoldenField.get(norm(f)) ?? f));
    const goldenId = new Set(m.golden.identityFields);
    const equal = genId.size === goldenId.size && [...goldenId].every((x) => genId.has(x));
    if (equal) idCorrect += 1;
    else {
      idDetails.push(`${m.golden.apiName}: golden=[${[...goldenId].join(',')}] gen=[${[...genId].join(',')}]`);
      issues.push({ dimension: 'identity', severity: 'CRITICAL', object: m.golden.apiName, detail: `identity golden=[${[...goldenId].join(',')}] gen=[${[...genId].join(',')}]`, keywords: [m.golden.apiName, 'identity', ...m.golden.identityFields] });
    }
  }

  // relationships (high-stakes): every golden relationship field should appear as a relationship to the right object
  let relFound = 0, relExpected = 0; const relDetails: string[] = [];
  for (const m of matches) {
    for (const gf of m.golden.fields) {
      if (gf.type !== 'relationship') continue;
      relExpected += 1;
      const pair = m.pairs.find((p) => p.golden.apiName === gf.apiName);
      const genField = pair?.gen;
      const targetGolden = genField?.relationshipTargetType
        ? genToGoldenObj.get(norm(genField.relationshipTargetType)) ??
          (OBJECT_SYNONYMS.some((g) => g.includes(norm(genField.relationshipTargetType!)) && g.includes(norm(gf.relationshipTargetType ?? ''))) ? gf.relationshipTargetType : undefined)
        : undefined;
      if (genField && genField.type === 'relationship' && targetGolden === gf.relationshipTargetType) {
        relFound += 1;
      } else {
        const how = !genField ? 'field missing' : genField.type !== 'relationship' ? `modeled as ${genField.type}, not relationship` : `target=${genField.relationshipTargetType ?? '?'} (expected ${gf.relationshipTargetType})`;
        relDetails.push(`${m.golden.apiName}.${gf.apiName} -> ${gf.relationshipTargetType}: ${how}`);
        issues.push({ dimension: 'relationship', severity: 'CRITICAL', object: m.golden.apiName, field: gf.apiName, detail: `relationship to ${gf.relationshipTargetType}: ${how}`, keywords: [gf.apiName, gf.label, gf.sourceColumn ?? '', 'relationship', gf.relationshipTargetType ?? ''] });
      }
    }
  }

  // aliases: did the matched object capture the golden alias variants
  let aliasCap = 0, aliasTotal = 0; const aliasDetails: string[] = [];
  for (const m of matches) {
    if (m.golden.aliasVariants.length === 0) continue;
    aliasTotal += 1;
    const genVars = new Set(m.gen.aliasVariants.map(norm));
    const hit = m.golden.aliasVariants.some((v) => genVars.has(norm(v)));
    if (hit) aliasCap += 1;
    else {
      aliasDetails.push(`${m.golden.apiName}: none of [${m.golden.aliasVariants.join(',')}] captured`);
      issues.push({ dimension: 'alias', severity: 'WARN', object: m.golden.apiName, detail: `aliases not captured: [${m.golden.aliasVariants.join(',')}]`, keywords: [m.golden.apiName, ...m.golden.aliasVariants] });
    }
  }

  // validity issue if the proposed contract failed the real refinements
  if (contractError)
    issues.push({ dimension: 'validity', severity: 'CRITICAL', detail: `proposed contract failed parseContract: ${contractError}`, keywords: ['valid', 'schema'] });

  // uncertainty recall: did the agent flag where it was wrong?
  const blob = [
    ...rawOutput.assumptions,
    ...rawOutput.openQuestions,
    ...rawOutput.lowConfidence.flatMap((l) => [l.area, l.why]),
  ]
    .join(' \n ')
    .toLowerCase();
  for (const issue of issues) {
    issue.flagged = issue.keywords.some((k) => {
      const n = norm(k);
      return n.length >= 3 && blob.includes(n);
    });
  }
  const critical = issues.filter((i) => i.severity === 'CRITICAL');
  const uncertainty = {
    totalIssues: issues.length,
    flagged: issues.filter((i) => i.flagged).length,
    recall: ratio(issues.filter((i) => i.flagged).length, issues.length),
    criticalTotal: critical.length,
    criticalFlagged: critical.filter((i) => i.flagged).length,
    criticalRecall: ratio(critical.filter((i) => i.flagged).length, critical.length),
    plausibleButWrong: critical.filter((i) => !i.flagged),
  };

  return {
    validity: { ok: contractError === null, error: contractError },
    objectCoverage: {
      precision: ratio(matches.length, A.length),
      recall: ratio(matches.length, G.length),
      matched: matches.length,
      golden: G.length,
      generated: A.length,
      missed: missedObjects.map((o) => o.apiName),
      extra: extraObjects.map((o) => o.apiName),
    },
    fieldCoverage: {
      precision: ratio(fMatched, fGen),
      recall: ratio(fMatched, fGolden),
      matched: fMatched,
      golden: fGolden,
      generated: fGen,
      missed: fMissed,
      extra: fExtra,
    },
    typeCorrectness: { correct: typeCorrect, total: typeTotal, mismatches: typeMismatch },
    enumCapture: { ok: enumOk, total: enumTotal, details: enumDetails },
    identity: { correct: idCorrect, total: matches.length, details: idDetails },
    relationships: { found: relFound, expected: relExpected, details: relDetails },
    agentWrite: { match: awMatch, total: awTotal, trustMisses: awTrust, mismatches: awMis },
    sensitive: { match: senMatch, total: senTotal, misses: senMiss },
    aliases: { captured: aliasCap, total: aliasTotal, details: aliasDetails },
    uncertainty,
    issues,
  };
}
