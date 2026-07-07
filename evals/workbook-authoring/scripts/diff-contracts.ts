/**
 * Structural stability check across N contract JSONs (spike #64 GO criterion 2).
 *
 * Usage: tsx scripts/diff-contracts.ts <a.json> <b.json> [c.json ...]
 *
 * Compares every contract against the first on structure, not naming:
 *   - the set of objects (matched via normalization + a small synonym map)
 *   - per matched object: field sets as normalized-name:type pairs,
 *     identity displayFields, relationship targets
 * Naming variance is tolerated; structural variance is not. Prints STABLE
 * (exit 0) or UNSTABLE with the differences (exit 1). Contracts must already
 * be schema-valid; run validate-contract.ts first.
 */
import { readFileSync } from 'node:fs';
import { parseContract, type Contract, type ContractObject } from '../src/contract.js';

// Seeded from v0's score.ts synonym groups, trimmed to this domain.
const OBJECT_SYNONYMS: string[][] = [
  ['person', 'people', 'client', 'clients', 'contact', 'contacts', 'customer', 'customers', 'lead', 'leads'],
  ['organization', 'organizations', 'company', 'companies', 'firm', 'firms', 'account', 'accounts'],
  ['deal', 'deals', 'listing', 'listings', 'property', 'properties', 'transaction', 'transactions', 'opportunity', 'opportunities'],
];
const FIELD_SYNONYMS: string[][] = [
  ['name', 'fullname', 'clientname', 'contactname', 'organizationname', 'companyname', 'firmname'],
  ['notes', 'note', 'comments', 'comment'],
  ['organization', 'company', 'firm', 'account'],
  ['datelastcontacted', 'lastcontacted', 'lastcontactdate', 'lastcontact'],
  ['followupdate', 'followup', 'nextfollowup', 'nextfollowupdate'],
  ['relationshiplead', 'lead', 'owner', 'internalowner'],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function sameName(a: string, b: string, groups: string[][]): boolean {
  if (a === b) return true;
  return groups.some((g) => g.includes(a) && g.includes(b));
}

interface ObjShape {
  name: string;
  fields: Map<string, string>; // normalized field name -> type
  identity: string[]; // normalized displayFields
  relTargets: Map<string, string>; // normalized field name -> normalized target object
}

function shape(c: Contract): ObjShape[] {
  return c.objects.map((o: ContractObject) => ({
    name: norm(o.apiName),
    fields: new Map(o.fields.map((f) => [norm(f.apiName), f.type])),
    identity: o.identity.displayFields.map(norm).sort(),
    relTargets: new Map(
      o.fields
        .filter((f) => f.type === 'relationship')
        .map((f) => [norm(f.apiName), norm(f.relationshipTargetType ?? '')]),
    ),
  }));
}

function matchField(name: string, other: ObjShape): string | undefined {
  if (other.fields.has(name)) return name;
  for (const cand of other.fields.keys()) {
    if (sameName(name, cand, FIELD_SYNONYMS)) return cand;
  }
  return undefined;
}

const files = process.argv.slice(2);
if (files.length < 2) {
  console.error('usage: diff-contracts.ts <a.json> <b.json> [c.json ...]');
  process.exit(2);
}

const contracts = files.map((f) => {
  try {
    return shape(parseContract(JSON.parse(readFileSync(f, 'utf8'))));
  } catch (err) {
    console.error(`UNSTABLE\n${f}: failed to parse as a valid contract: ${(err as Error).message}`);
    process.exit(1);
  }
}) as ObjShape[][];

const base = contracts[0]!;
const problems: string[] = [];

for (let i = 1; i < contracts.length; i++) {
  const other = contracts[i]!;
  const tag = `${files[0]} vs ${files[i]}`;
  const usedOther = new Set<number>();

  for (const bo of base) {
    const idx = other.findIndex((oo, j) => !usedOther.has(j) && sameName(bo.name, oo.name, OBJECT_SYNONYMS));
    if (idx === -1) {
      problems.push(`${tag}: object "${bo.name}" has no counterpart`);
      continue;
    }
    usedOther.add(idx);
    const oo = other[idx]!;

    for (const [fname, ftype] of bo.fields) {
      const match = matchField(fname, oo);
      if (!match) {
        problems.push(`${tag}: ${bo.name}.${fname} missing in counterpart "${oo.name}"`);
      } else if (oo.fields.get(match) !== ftype) {
        problems.push(
          `${tag}: ${bo.name}.${fname} type ${ftype} vs ${oo.name}.${match} type ${oo.fields.get(match)}`,
        );
      }
    }
    for (const fname of oo.fields.keys()) {
      if (!matchField(fname, bo)) {
        problems.push(`${tag}: ${oo.name}.${fname} is extra (absent in ${files[0]})`);
      }
    }

    const [bi, oi] = [bo.identity.join('+'), oo.identity.join('+')];
    if (bi !== oi && !bo.identity.every((f, k) => sameName(f, oo.identity[k] ?? '', FIELD_SYNONYMS))) {
      problems.push(`${tag}: ${bo.name} identity [${bi}] vs [${oi}]`);
    }

    for (const [fname, target] of bo.relTargets) {
      const match = matchField(fname, oo);
      const otherTarget = match ? oo.relTargets.get(match) : undefined;
      if (otherTarget !== undefined && !sameName(target, otherTarget, OBJECT_SYNONYMS)) {
        problems.push(`${tag}: ${bo.name}.${fname} targets "${target}" vs "${otherTarget}"`);
      }
    }
  }
  for (const [j, oo] of other.entries()) {
    if (!usedOther.has(j)) problems.push(`${tag}: object "${oo.name}" is extra (absent in ${files[0]})`);
  }
}

if (problems.length === 0) {
  console.log(`STABLE across ${files.length} contract(s)`);
} else {
  console.log(`UNSTABLE: ${problems.length} structural difference(s)`);
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
