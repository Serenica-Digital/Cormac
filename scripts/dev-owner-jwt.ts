import { SignJWT } from 'jose';

/**
 * Mint a development HS256 owner JWT for driving the API by hand (the same
 * shape the integration harness mints). HS256 is the local-stack path only;
 * prod-like environments refuse it. Usage:
 *   SUPABASE_JWT_SECRET=... SUPABASE_URL=... tsx scripts/dev-owner-jwt.ts <userId>
 */
const sub = process.argv[2];
if (!sub) {
  console.error('usage: dev-owner-jwt.ts <userId>');
  process.exit(2);
}
const secretValue = process.env.SUPABASE_JWT_SECRET;
if (!secretValue) {
  console.error('SUPABASE_JWT_SECRET unset');
  process.exit(2);
}
const secret = new TextEncoder().encode(secretValue);
const issuer = process.env.SUPABASE_AUTH_ISSUER ?? `${process.env.SUPABASE_URL}/auth/v1`;
const token = await new SignJWT({})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(issuer)
  .setAudience('authenticated')
  .setSubject(sub)
  .setExpirationTime('4h')
  .sign(secret);
console.log(token);
