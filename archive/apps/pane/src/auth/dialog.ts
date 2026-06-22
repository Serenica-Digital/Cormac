import { supabase } from '../supabase';
import { errMsg, type FailureMode, type SignInLane, type SignInOutcome } from './lanes';

/**
 * Lane B: the documented fallback. An Office dialog (our origin) runs the OAuth
 * code flow against Entra through Supabase, then posts the resulting tokens back
 * to the pane with messageParent. The pane calls setSession. The PKCE verifier
 * lives in the dialog's own storage between relay.html and callback.html; only
 * the final tokens cross the boundary, never shared storage.
 *
 * This is the one chunk of genuinely hand-rolled plumbing in the auth design,
 * because the Office Dialog API is its own message channel. The OAuth itself is
 * Supabase's.
 */
export function dialogLane(): SignInLane {
  return {
    id: 'dialog',
    label: 'Microsoft dialog (Lane B · fallback)',
    description: 'An Office dialog runs the OAuth code flow and returns tokens via messageParent. The reliable fallback if Lane A fails.',
    available: () => hasDialogApi(),
    signIn(): Promise<SignInOutcome> {
      // Read window lazily, not at factory time, so the lane is constructible
      // before Office/window are ready (and in tests).
      const relayUrl = `${window.location.origin}/relay.html`;
      return new Promise<SignInOutcome>((resolve) => {
        try {
          Office.context.ui.displayDialogAsync(
            relayUrl,
            { height: 60, width: 30, promptBeforeOpen: false },
            (res) => {
              if (res.status !== Office.AsyncResultStatus.Succeeded) {
                resolve({
                  ok: false,
                  lane: 'dialog',
                  failureMode: classifyDisplay(res.error?.code),
                  detail: res.error?.message,
                });
                return;
              }
              const dialog = res.value;
              let settled = false;
              const finish = (outcome: SignInOutcome) => {
                if (settled) return;
                settled = true;
                try {
                  dialog.close();
                } catch {
                  /* already closed */
                }
                resolve(outcome);
              };

              dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
                const message = (arg as { message?: string }).message ?? '';
                void handleMessage(message, finish);
              });
              dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
                const code = (arg as { error?: number }).error;
                // 12006: dialog closed by the user before completing.
                finish({
                  ok: false,
                  lane: 'dialog',
                  failureMode: code === 12006 ? 'cancelled' : 'unknown',
                  detail: `dialog event ${code ?? '?'}`,
                });
              });
            },
          );
        } catch (e) {
          resolve({ ok: false, lane: 'dialog', failureMode: 'unsupported', detail: errMsg(e) });
        }
      });
    },
  };
}

async function handleMessage(
  message: string,
  finish: (o: SignInOutcome) => void,
): Promise<void> {
  try {
    const tokens = JSON.parse(message) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };
    if (tokens.error || !tokens.access_token || !tokens.refresh_token) {
      finish({ ok: false, lane: 'dialog', failureMode: 'unknown', detail: tokens.error ?? 'no tokens in message' });
      return;
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (error || !data.session) {
      finish({ ok: false, lane: 'dialog', failureMode: 'unknown', detail: error?.message });
      return;
    }
    finish({ ok: true, lane: 'dialog', session: data.session });
  } catch (e) {
    finish({ ok: false, lane: 'dialog', failureMode: 'unknown', detail: errMsg(e) });
  }
}

function hasDialogApi(): boolean {
  try {
    return typeof Office !== 'undefined' && Boolean(Office.context?.ui?.displayDialogAsync);
  } catch {
    return false;
  }
}

function classifyDisplay(code?: number): FailureMode {
  // 12007: a dialog is already open. 12009: user blocked the dialog.
  if (code === 12009) return 'popup_blocked';
  return 'unknown';
}
