import type { Session } from '@supabase/supabase-js';

/**
 * The systematic seam for sign-in. The control plane validates any Supabase JWT
 * regardless of how it was minted (apps/api/src/auth.ts is provider-blind), so
 * the client mirrors that: a lane is the ONLY place the three flows differ, and
 * everything downstream of a Session (the bearer header, getSession,
 * onAuthStateChange, the Probe B user.id readout) is lane-blind by construction.
 *
 * Adding a lane means implementing this one interface; nothing else changes.
 */

export type LaneId = 'password' | 'naa' | 'dialog';

export type Platform = 'windows' | 'mac' | 'web' | 'unknown';

/** One vocabulary for why a lane failed, shared across all lanes so the
 * diagnostic readout (Probe B) is uniform and comparable per platform. */
export type FailureMode =
  | 'cancelled'
  | 'bad_credentials'
  | 'no_account'
  | 'nonce_mismatch'
  | 'aud_mismatch'
  | 'mac_webview_abort'
  | 'provider_not_configured'
  | 'popup_blocked'
  | 'network'
  | 'unsupported'
  | 'unknown';

export type SignInOutcome =
  | { ok: true; lane: LaneId; session: Session }
  | { ok: false; lane: LaneId; failureMode: FailureMode; detail?: string };

export interface SignInLane {
  id: LaneId;
  label: string;
  description: string;
  /** Whether to offer this lane on the current platform at all. */
  available(platform: Platform): boolean;
  /** Mint (or fail to mint) a Supabase session. On success the session is
   * already persisted in the shared client; the caller need not store it. */
  signIn(): Promise<SignInOutcome>;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
