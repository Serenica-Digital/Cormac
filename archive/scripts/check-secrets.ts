import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Static guard against the most common secret-leak mistakes (control-register
 * row 12): a tracked .env, the service-role key referenced in client code, or a
 * private key in source. Scans git-TRACKED files only, so a normal local
 * (gitignored) .env does not trip it. Runs without a database.
 */
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const problems: string[] = [];

const readText = (file: string): string => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

for (const file of tracked) {
  const base = file.split('/').pop() ?? file;

  // 1. No tracked .env (only .env.example is allowed).
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) {
    problems.push(`tracked env file: ${file}`);
  }

  // 2. The browser bundle must never reference the service-role key.
  if (file.startsWith('apps/web/') && /\.(ts|tsx|js|jsx)$/.test(file)) {
    if (/service_role/i.test(readText(file))) {
      problems.push(`service-role key referenced in client code: ${file}`);
    }
  }

  // 3. No private keys or provider secrets in tracked source. The value
  // patterns require real key-length tails, so docs placeholders like
  // "sk-ant-..." or "sb_secret_<paste>" do not trip them.
  if (/\.(ts|tsx|js|jsx|json|ya?ml|md|sql|env|sh)$/.test(file) || base.startsWith('.env')) {
    const text = readText(file);
    if (/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(text)) {
      problems.push(`private key material in ${file}`);
    }
    const providerKeys: [string, RegExp][] = [
      ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{24,}/],
      ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{16,}/],
      ['GitHub token', /(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{36,})/],
    ];
    for (const [label, pattern] of providerKeys) {
      if (pattern.test(text)) problems.push(`${label} in ${file}`);
    }
    // Connection strings with a real embedded password (placeholders like
    // "...", "<password>", "${VAR}" and the local dev password are exempt).
    const conn = text.match(/postgres(?:ql)?:\/\/\w+:([^@\s'"]+)@/g) ?? [];
    for (const m of conn) {
      const password = /:\/\/\w+:([^@\s'"]+)@/.exec(m)?.[1] ?? '';
      const placeholder =
        password.includes('...') ||
        password.includes('<') ||
        password.includes('${') ||
        password.includes('[') ||
        password === 'postgres';
      if (!placeholder) problems.push(`connection string with embedded password in ${file}`);
    }
  }
}

if (problems.length > 0) {
  console.error('Secret scan FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Secret scan: clean (${tracked.length} tracked files).`);
