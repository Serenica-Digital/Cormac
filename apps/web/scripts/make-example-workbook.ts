import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as XLSX from 'xlsx';

/**
 * Generate the example client workbook (docs/dev/relationship-crm-example.xlsx):
 * a fictional relationship tracker with the same three-sheet shape as the
 * authoring fixture (evals/workbook-authoring/fixture/relationship-crm.detected.json),
 * safe to share and upload anywhere. The real client workbook it echoes is
 * private and never leaves docs/notes in the archive.
 *
 * Lives in apps/web (not scripts/) so it resolves this package's xlsx
 * dependency without adding one at the root.
 *
 * Run: pnpm exec tsx apps/web/scripts/make-example-workbook.ts [out.xlsx]
 */

const sportsOperators = [
  ['Main Contact', 'Company', 'Relationship Lead', 'Sport', 'Date Last Contacted', 'Days Since Contact', 'Follow-Up Date', 'Notes'],
  ['Dana Morgan', 'Meridian Sports Group', 'PW', 'Baseball', '2026-06-30', 9, '2026-07-14', 'Two stadium deals in motion.'],
  ['Victor Ramos', 'Meridian Sports Group', 'PW', 'Soccer', '2026-05-22', 48, '', 'Showed one opportunity, waiting on their board.'],
  ['Curt Ellison', 'Pinnacle Arenas', 'TW', 'Basketball', '2026-06-11', 28, '2026-07-21', ''],
  ['Renee Vaughn', 'Lakeshore Events Group', 'TW', 'Hockey', '2026-04-18', 82, '', 'Season ended; circle back in fall.'],
  ['Hal Whitfield', 'Frontier Field Ops', 'PW', 'Baseball', '2026-07-02', 7, '2026-07-16', ''],
  ['Mia Sandoval', 'Meridian Sports Group', 'JD', 'Football', '2026-06-25', 14, '', 'Met at the operators dinner.'],
];

const bankersBrokers = [
  ['Name', 'Firm', 'Coverage Area', 'Relationship Lead', 'Date Last Contacted', 'Days Since Contact', 'Follow-Up Date', 'Notes'],
  ['Morgan Ellis', 'Hartwell Capital', 'Southeast', 'PW', '2026-06-24', 15, '2026-07-15', 'Long-standing lender relationship.'],
  ['James Carter', 'Bluewater Holdings', 'Northeast', 'PW', '2026-07-01', 8, '2026-07-10', 'Negotiating the marina package.'],
  ['Priya Shah', 'Ashford & Gray', 'Mid-Atlantic', 'TW', '2026-06-18', 21, '', ''],
  ['Tom Okafor', 'Beacon Point Advisors', '', 'JD', '2026-05-29', 41, '', 'Prefers calls over email.'],
  ['Elaine Fischer', 'Northgate Banking', 'Pacific Northwest', 'TW', '', '', '', 'New coverage; intro pending.'],
  ['Ruth Calloway', 'Summit Ridge Partners', '', 'PW', '2026-05-02', 68, '', 'Left the firm? Email bounced in May.'],
  ['Sam Whitaker', 'Hartwell Capital', 'Texas', 'JD', '2026-06-09', 30, '2026-07-18', ''],
  ['Nina Petrov', 'Northgate Banking', '', 'TW', '2026-07-03', 6, '', ''],
  ['Marcus Webb', 'Ashford & Gray', 'Midwest', 'PW', '2026-06-27', 12, '', 'Introduced by Priya.'],
  ['Julia Tran', 'Stonebridge Group', 'Southern California', 'JD', '2026-06-10', 29, '2026-07-24', ''],
  ['Owen Gallagher', 'Beacon Point Advisors', '', 'TW', '2026-06-20', 19, '2026-07-20', 'Asked for the Q3 pipeline.'],
];

const capitalPartners = [
  ['Firm', 'Main Contact', 'Relationship Lead', 'Date Last Contacted', 'Days Since Contact', 'Follow-Up Date', 'Opportunities Shown', 'Notes'],
  ['Hartwell Capital', 'Morgan Ellis', 'PW', '2026-06-24', 15, '2026-07-15', 3, ''],
  ['Bluewater Holdings', 'James Carter', 'PW', '2026-07-01', 8, '2026-07-10', 5, 'Carter deal in progress.'],
  ['Beacon Point Advisors', 'Tom Okafor', 'JD', '2026-05-29', 41, '', 1, ''],
  ['Summit Ridge Partners', 'Ruth Calloway', 'PW', '2026-05-02', 68, '', 0, 'Went quiet in 2025.'],
  ['Ashford & Gray', 'Priya Shah', 'TW', '2026-06-18', 21, '', 2, ''],
  ['Stonebridge Group', 'Julia Tran', 'JD', '2026-06-10', 29, '2026-07-24', 2, 'Active again after the rebrand.'],
  ['Northgate Banking', 'Elaine Fischer', 'TW', '', '', '', 0, 'New coverage; intro pending.'],
  ['Ironbridge Partners', 'Cole Barrett', 'PW', '2026-04-30', 70, '', 1, ''],
];

const out = resolve(
  process.argv[2] ?? new URL('../../../docs/dev/relationship-crm-example.xlsx', import.meta.url).pathname,
);
mkdirSync(dirname(out), { recursive: true });

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sportsOperators), 'Sports Operators');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bankersBrokers), 'Bankers & Brokers');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(capitalPartners), 'Capital Partners');
XLSX.writeFile(wb, out);
console.log(`wrote ${out}`);
