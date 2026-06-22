import {
  createNestablePublicClientApplication,
  type AuthenticationResult,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { supabase } from '../supabase';
import { env } from '../env';
import { errMsg, type FailureMode, type Platform, type SignInLane, type SignInOutcome } from './lanes';

/**
 * Lane A: Nested App Auth. MSAL brokers a silent Entra token through the Office
 * host; we exchange its id_token for a Supabase session with signInWithIdToken.
 * This lane is doubly unproven (the spike exists to measure it):
 *  - Supabase may reject the MSAL id_token on a nonce or audience mismatch
 *    (documented community failures) -> nonce_mismatch / aud_mismatch.
 *  - NAA has an open abort bug on Mac's WKWebView -> mac_webview_abort.
 *
 * The crypto and the token exchange are MSAL's and Supabase's; the only thing we
 * own is the orchestration and classifying why it failed.
 */

const clientId = env.VITE_ENTRA_CLIENT_ID;
const authority = env.VITE_ENTRA_AUTHORITY ?? 'https://login.microsoftonline.com/common';
const SCOPES = ['openid', 'profile', 'email'];

let pcaPromise: Promise<IPublicClientApplication> | null = null;
function getPca(): Promise<IPublicClientApplication> {
  if (!pcaPromise) {
    pcaPromise = createNestablePublicClientApplication({
      auth: { clientId: clientId ?? '', authority },
    });
  }
  return pcaPromise;
}

export function naaLane(getPlatform: () => Platform): SignInLane {
  return {
    id: 'naa',
    label: 'Microsoft silent (Lane A · NAA)',
    description: 'Silent Entra token exchanged for a Supabase session. Unproven: nonce/aud mismatch and the Mac WKWebView abort.',
    available: () => Boolean(clientId),
    async signIn(): Promise<SignInOutcome> {
      if (!clientId) {
        return { ok: false, lane: 'naa', failureMode: 'provider_not_configured', detail: 'VITE_ENTRA_CLIENT_ID unset' };
      }
      let result: AuthenticationResult;
      try {
        const pca = await getPca();
        try {
          result = await pca.acquireTokenSilent({ scopes: SCOPES });
        } catch {
          // No cached account or consent needed: fall back to interactive, which
          // the host renders. A genuine Mac WKWebView abort surfaces here.
          result = await pca.acquireTokenPopup({ scopes: SCOPES });
        }
      } catch (e) {
        return { ok: false, lane: 'naa', failureMode: classifyMsal(e, getPlatform()), detail: errMsg(e) };
      }

      const idToken = result.idToken;
      const nonce = readNonce(idToken);
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'azure',
        token: idToken,
        ...(nonce ? { nonce } : {}),
      });
      if (error || !data.session) {
        return { ok: false, lane: 'naa', failureMode: classifySupabase(error?.message), detail: error?.message };
      }
      return { ok: true, lane: 'naa', session: data.session };
    },
  };
}

/** Decode the `nonce` claim from a JWT id_token payload (base64url), so we can
 * pass it to Supabase. Whether the raw vs hashed nonce is what Supabase wants is
 * exactly the unknown Probe B measures. */
function readNonce(jwt: string): string | undefined {
  try {
    const part = jwt.split('.')[1];
    if (!part) return undefined;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { nonce?: string };
    return payload.nonce;
  } catch {
    return undefined;
  }
}

export function classifySupabase(message?: string): FailureMode {
  const m = (message ?? '').toLowerCase();
  if (m.includes('nonce')) return 'nonce_mismatch';
  if (m.includes('aud') || m.includes('audience')) return 'aud_mismatch';
  if (m.includes('provider') || m.includes('not enabled')) return 'provider_not_configured';
  if (m.includes('fetch') || m.includes('network')) return 'network';
  return 'unknown';
}

export function classifyMsal(e: unknown, platform: Platform): FailureMode {
  const m = errMsg(e).toLowerCase();
  if (m.includes('user_cancelled') || m.includes('cancelled')) return 'cancelled';
  if (m.includes('popup') || m.includes('window')) return 'popup_blocked';
  // A bare abort on Mac is the known NAA WKWebView bug.
  if (platform === 'mac' && (m.includes('abort') || m.includes('timeout') || m.includes('interaction'))) {
    return 'mac_webview_abort';
  }
  return 'unknown';
}
