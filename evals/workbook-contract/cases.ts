/**
 * The authoring eval corpus (ADR-023 open item 4). Each case pairs a detected
 * workbook profile with a hand-authored golden contract. To add a fixture: drop
 * a `<name>.detected.json` in fixture/ and a `<name>.contract.json` in golden/,
 * then add one row here. Paths are relative to this directory.
 *
 * Golden contracts encode one defensible reading of an ambiguous workbook, not
 * the only one. Author the golden by hand first, then keep the fixture honest.
 */

export interface WorkbookCase {
  name: string;
  detected: string;
  golden: string;
}

export const CASES: WorkbookCase[] = [
  {
    name: 'contacts-deals (synthetic real-estate)',
    detected: 'fixture/contacts-deals.detected.json',
    golden: 'golden/contacts-deals.contract.json',
  },
  {
    name: 'relationship-crm (anonymized, modeled on a real workbook)',
    detected: 'fixture/relationship-crm.detected.json',
    golden: 'golden/relationship-crm.contract.json',
  },
];
