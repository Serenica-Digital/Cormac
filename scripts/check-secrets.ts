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

  // 3. No private keys in tracked source.
  if (/\.(ts|tsx|js|jsx|json|ya?ml|md|sql|env)$/.test(file) || base.startsWith('.env')) {
    if (/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(readText(file))) {
      problems.push(`private key material in ${file}`);
    }
  }
}

if (problems.length > 0) {
  console.error('Secret scan FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Secret scan: clean (${tracked.length} tracked files).`);
