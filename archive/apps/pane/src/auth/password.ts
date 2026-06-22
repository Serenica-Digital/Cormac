import { supabase } from '../supabase';
import type { FailureMode, SignInLane, SignInOutcome } from './lanes';

/**
 * Lane 0: email + password. Works in-pane today with zero Azure setup, so it
 * unblocks Probes A/C/D/E before any Entra registration exists. Pure Supabase
 * SDK; nothing here is hand-rolled. Uses the seeded owner@demo.cormac.test.
 */
export function passwordLane(creds: () => { email: string; password: string }): SignInLane {
  return {
    id: 'password',
    label: 'Email + password (Lane 0)',
    description: 'Zero Azure. Unblocks every non-auth probe and gives Probe B its baseline user.id.',
    available: () => true,
    async signIn(): Promise<SignInOutcome> {
      const { email, password } = creds();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        return { ok: false, lane: 'password', failureMode: classifyPassword(error?.message), detail: error?.message };
      }
      return { ok: true, lane: 'password', session: data.session };
    },
  };
}

export function classifyPassword(message?: string): FailureMode {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login') || m.includes('credentials')) return 'bad_credentials';
  if (m.includes('fetch') || m.includes('network')) return 'network';
  return 'unknown';
}
