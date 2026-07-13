import type { ContractObject } from '@cormac/contract';
import type { BusinessRecordRow } from '../api/types';
import { recordTitle } from '../contract-helpers';

/**
 * The attention layer: what in the book needs a human today. Everything here
 * is driven by the contract's `semantic` tags (`follow_up`, `last_touch`), so
 * it works on meaning, never on hardcoded column names. A book whose contract
 * carries no semantics simply produces no items; that asymmetry is honest.
 * Pure and unit-tested; both Cormac's greeting and the Book's chips feed here.
 */

/** A relationship with no touch for this many days has gone quiet. */
export const STALE_AFTER_DAYS = 30;
/** Follow-ups this many days out still make the morning list. */
export const FOLLOW_UP_HORIZON_DAYS = 7;

export type AttentionKind = 'follow_up_overdue' | 'follow_up_due' | 'stale';

export interface AttentionItem {
  kind: AttentionKind;
  recordId: string;
  objectApiName: string;
  title: string;
  /** Plain-language clause, ready to say: "follow-up was due Jul 10". */
  detail: string;
  /** The driving date, YYYY-MM-DD. */
  date: string;
  /** Signed days from today to the driving date (overdue and stale are negative). */
  days: number;
}

export interface Attention {
  /** Follow-ups then stale, each sorted most-urgent first. */
  items: AttentionItem[];
  followUps: AttentionItem[];
  stale: AttentionItem[];
  pendingCount: number;
}

/** Local calendar day of a Date as YYYY-MM-DD. */
export function dayOf(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Milliseconds at UTC midnight of a YYYY-MM-DD day. */
const utcOf = (day: string) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

/** Whole calendar days from `fromDay` to `toDay` (both YYYY-MM-DD; positive = future). */
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((utcOf(toDay) - utcOf(fromDay)) / 86_400_000);
}

/** "today", "tomorrow", or a short date ("Jul 20"), relative to `today`. */
export function dayWord(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  const short = new Date(utcOf(day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return day.slice(0, 4) === today.slice(0, 4) ? short : `${short}, ${day.slice(0, 4)}`;
}

/** A field value that should hold a date, reduced to YYYY-MM-DD, or null. */
export function asDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function buildAttention({
  objects,
  records,
  pendingCount,
  now,
}: {
  objects: ContractObject[];
  records: BusinessRecordRow[];
  pendingCount: number;
  now: Date;
}): Attention {
  const today = dayOf(now);
  const followUps: AttentionItem[] = [];
  const stale: AttentionItem[] = [];

  for (const object of objects) {
    const followUpField = object.fields.find((f) => f.semantic === 'follow_up');
    const lastTouchField = object.fields.find((f) => f.semantic === 'last_touch');
    if (!followUpField && !lastTouchField) continue;

    for (const record of records) {
      if (record.object_api_name !== object.apiName || record.archived_at) continue;
      const title = recordTitle(object, record.data);

      const followUpDay = followUpField ? asDay(record.data[followUpField.apiName]) : null;
      if (followUpDay) {
        const days = daysBetween(today, followUpDay);
        if (days < 0) {
          followUps.push({
            kind: 'follow_up_overdue',
            recordId: record.id,
            objectApiName: object.apiName,
            title,
            detail: `follow-up was due ${dayWord(followUpDay, today)}`,
            date: followUpDay,
            days,
          });
        } else if (days <= FOLLOW_UP_HORIZON_DAYS) {
          followUps.push({
            kind: 'follow_up_due',
            recordId: record.id,
            objectApiName: object.apiName,
            title,
            detail: `follow-up due ${dayWord(followUpDay, today)}`,
            date: followUpDay,
            days,
          });
        }
      }

      // A scheduled follow-up already carries this record's attention; only
      // records with no follow-up in play can go quiet.
      const lastTouchDay = lastTouchField ? asDay(record.data[lastTouchField.apiName]) : null;
      if (lastTouchDay && !followUpDay) {
        const days = daysBetween(today, lastTouchDay);
        if (-days > STALE_AFTER_DAYS) {
          stale.push({
            kind: 'stale',
            recordId: record.id,
            objectApiName: object.apiName,
            title,
            detail: `quiet for ${-days} days`,
            date: lastTouchDay,
            days,
          });
        }
      }
    }
  }

  // Most urgent first: most-overdue follow-ups, then nearest due; quietest stale.
  followUps.sort((a, b) => a.days - b.days);
  stale.sort((a, b) => a.days - b.days);

  return { items: [...followUps, ...stale], followUps, stale, pendingCount };
}
