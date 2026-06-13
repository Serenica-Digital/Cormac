import { describe, expect, it, vi } from 'vitest';

// The lane modules import the shared Supabase client (createClient throws
// without VITE_* env); stub it so the pure classifiers and availability logic
// are importable.
vi.mock('../supabase', () => ({ supabase: {} }));

import { dialogLane } from './dialog';
import { classifyMsal, classifySupabase, naaLane } from './msal';
import { classifyPassword, passwordLane } from './password';

describe('failure classifiers', () => {
  it('password', () => {
    expect(classifyPassword('Invalid login credentials')).toBe('bad_credentials');
    expect(classifyPassword('TypeError: failed to fetch')).toBe('network');
    expect(classifyPassword('something else')).toBe('unknown');
    expect(classifyPassword(undefined)).toBe('unknown');
  });

  it('supabase id-token exchange (the Lane A unknowns)', () => {
    expect(classifySupabase('Nonce mismatch')).toBe('nonce_mismatch');
    expect(classifySupabase('invalid audience claim')).toBe('aud_mismatch');
    expect(classifySupabase('Provider azure is not enabled')).toBe('provider_not_configured');
    expect(classifySupabase('mystery')).toBe('unknown');
  });

  it('msal (the Mac WKWebView abort is platform-specific)', () => {
    expect(classifyMsal(new Error('user_cancelled'), 'windows')).toBe('cancelled');
    expect(classifyMsal(new Error('interaction was aborted'), 'mac')).toBe('mac_webview_abort');
    // The same abort string on Windows is not the Mac bug.
    expect(classifyMsal(new Error('interaction was aborted'), 'windows')).toBe('unknown');
  });
});

describe('lane availability', () => {
  it('password is always available', () => {
    expect(passwordLane(() => ({ email: '', password: '' })).available('web')).toBe(true);
  });

  it('NAA is unavailable without an Entra client id', () => {
    // VITE_ENTRA_CLIENT_ID is unset in the test env.
    expect(naaLane(() => 'web').available('web')).toBe(false);
  });

  it('dialog is unavailable without the Office dialog API', () => {
    expect(dialogLane().available('web')).toBe(false);
  });
});
