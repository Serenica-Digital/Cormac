import { describe, expect, it } from 'vitest';
import { detectHeaderRow, detectSheet, inferType, toDetectionProfile } from '../src/workbook/detect';
import type { ParsedSheet } from '../src/workbook/types';

/** Grid shaped like the fixture's banner case: title rows above real headers. */
const bannerGrid: string[][] = [
  ['Relationship Tracker', '', '', ''],
  ['Q2 2026', '', '', ''],
  ['', '', '', ''],
  ['updated weekly', '', '', ''],
  ['Main Contact', 'Company', 'Sport', 'Days Since Contact'],
  ['Marcus Tate', 'Summit League', 'Baseball', '31'],
  ['Dana Whitfield', 'Harbor Sports', 'Soccer', '12'],
  ['Lee Ovalle', 'Summit League', 'Baseball', '4'],
];

describe('detectHeaderRow', () => {
  it('skips banner rows and finds the real header (the fixture case)', () => {
    expect(detectHeaderRow(bannerGrid)).toBe(4);
  });

  it('picks row 0 on a plain grid', () => {
    expect(
      detectHeaderRow([
        ['Name', 'Email'],
        ['Ann', 'ann@x.com'],
      ]),
    ).toBe(0);
  });
});

describe('inferType', () => {
  it('types numbers, dates, booleans, and falls back to string', () => {
    expect(inferType(['31', '12', '4'])).toBe('number');
    expect(inferType(['2026-05-04', '2026-07-03'])).toBe('date');
    expect(inferType(['6/1/26', '12/31/2025'])).toBe('date');
    expect(inferType(['yes', 'no', 'yes'])).toBe('boolean');
    expect(inferType(['Baseball', 'Soccer'])).toBe('string');
    expect(inferType(['31', 'Baseball'])).toBe('string');
    expect(inferType(['', ''])).toBe('string');
  });
});

describe('detectSheet / toDetectionProfile', () => {
  const sheet: ParsedSheet = { name: 'Sports Operators', grid: bannerGrid, headerRowIndex: 4 };

  it('produces the fixture-shaped profile: 1-based headerRow, counts, samples, sampleRows', () => {
    const detected = detectSheet(sheet);
    expect(detected.name).toBe('Sports Operators');
    expect(detected.headerRow).toBe(5);
    expect(detected.rowCount).toBe(3);

    const company = detected.columns.find((c) => c.header === 'Company');
    expect(company).toMatchObject({ nonEmpty: 3, distinctCount: 2, inferredType: 'string' });
    expect(company?.samples).toEqual(['Summit League', 'Harbor Sports']);

    const days = detected.columns.find((c) => c.header === 'Days Since Contact');
    expect(days?.inferredType).toBe('number');

    expect(detected.sampleRows).toHaveLength(2);
    expect(detected.sampleRows[0]).toMatchObject({
      'Main Contact': 'Marcus Tate',
      Company: 'Summit League',
    });
  });

  it('wraps sheets under workbookName like the stored profiles', () => {
    const profile = toDetectionProfile({ workbookName: 'tracker.xlsx', sheets: [sheet] });
    expect(Object.keys(profile).sort()).toEqual(['sheets', 'workbookName']);
    expect(profile.workbookName).toBe('tracker.xlsx');
    expect(profile.sheets).toHaveLength(1);
  });
});
