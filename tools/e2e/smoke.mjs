import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Headless render smoke: sign in as a persona (docs/dev/demo-accounts.md),
 * walk every page of every reachable workspace at desktop and mobile width,
 * and fail on console errors, blank roots, or page-level horizontal scroll.
 * This is the check that catches what typecheck/tests/build cannot: real
 * render crashes (it found the Button/Slot single-child bug).
 *
 * Uses the Playwright-cached Chromium headless shell; nothing leaves the
 * machine. Run the stack first: pnpm db:start, the control plane, the web
 * dev server, and pnpm seed:demo.
 *
 * Env: SMOKE_BASE (default http://localhost:5175),
 *      SMOKE_EMAIL (default owner@demo.test),
 *      SMOKE_PASSWORD (default cormac-demo).
 */

function findHeadlessShell() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort()
    .reverse();
  for (const d of dirs) {
    const exe = join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (existsSync(exe)) return exe;
  }
  return null;
}

const EXE = findHeadlessShell();
if (!EXE) {
  console.error(
    'No cached Chromium headless shell under ~/Library/Caches/ms-playwright.\n' +
      'Fetch one with: pnpm exec playwright-core install chromium-headless-shell',
  );
  process.exit(2);
}

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:5175';
const EMAIL = process.env.SMOKE_EMAIL ?? 'owner@demo.test';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'cormac-demo';
const SHOTS = new URL('../../.jarvis/tmp/notes/render-smoke/shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const PAGES = [
  'start',
  'interview',
  'workbook',
  'records',
  'import',
  'contract',
  'audit',
  'members',
];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

// Role expectations for the demo personas (docs/dev/demo-accounts.md):
// what the sidebar reveals and whether the capture box exists. Checked on
// desktop only (the mobile sidebar lives in a sheet).
const ROLE_CHECKS = {
  owner: { people: true, setupTools: true, capture: true },
  admin: { people: true, setupTools: true, capture: true },
  manager: { people: false, setupTools: false, capture: true },
  member: { people: false, setupTools: false, capture: true },
  viewer: { people: false, setupTools: false, capture: false },
};

const problems = [];

const browser = await chromium.launch({ executablePath: EXE });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (msg) => {
    // 404s are how the API signals "no contract yet"; not a defect.
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text()))
      errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // Sign in
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  if (page.url().includes('/signin')) {
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.includes('signin'), { timeout: 15000 });
    await page.waitForLoadState('networkidle');
  }
  await page.screenshot({ path: `${SHOTS}${vp.name}-00-after-signin.png` });

  // Wait for the workspaces query to resolve: either the picker renders its
  // rows or a single membership redirects straight into /w/:id.
  await Promise.race([
    page.waitForURL(/\/w\//, { timeout: 10000 }).catch(() => {}),
    page.waitForSelector('div.space-y-2 > button', { timeout: 10000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(300);

  // Collect workspace ids: either picker buttons or already inside one.
  let wsIds = [];
  if (/\/w\//.test(page.url())) {
    wsIds = [page.url().match(/\/w\/([^/]+)/)[1]];
  } else {
    // Picker: click each row, note the id, go back.
    const count = await page.locator('div.space-y-2 > button').count();
    for (let i = 0; i < count; i++) {
      await page.locator('div.space-y-2 > button').nth(i).click();
      await page.waitForURL(/\/w\//, { timeout: 10000 });
      wsIds.push(page.url().match(/\/w\/([^/]+)/)[1]);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    }
  }
  console.log(`[${vp.name}] ${EMAIL} workspaces: ${wsIds.join(', ') || '(none)'}`);

  for (const [wi, ws] of wsIds.entries()) {
    for (const p of PAGES) {
      const before = errors.length;
      await page.goto(`${BASE}/w/${ws}/${p}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      const hscroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const blank = await page.evaluate(
        () => document.getElementById('root')?.innerText.trim() === '',
      );
      await page.screenshot({ path: `${SHOTS}${vp.name}-ws${wi}-${p}.png`, fullPage: false });
      const newErrors = errors.slice(before);
      const flags = [
        hscroll > 1 ? `HSCROLL +${hscroll}px` : null,
        blank ? 'BLANK PAGE' : null,
        newErrors.length ? `${newErrors.length} console error(s)` : null,
      ].filter(Boolean);
      if (flags.length)
        problems.push(`[${vp.name}] ws${wi}/${p}: ${flags.join(', ')} ${newErrors[0] ?? ''}`);
      console.log(`[${vp.name}] ws${wi}/${p} ok=${flags.length === 0} ${flags.join(' | ')}`);
    }

    // Role flows: the nav and the Cormac panel must match the persona. The
    // capture box lives in the Book's side panel and only exists once the
    // book is live; a setup-stage workspace correctly shows none.
    const checks = EMAIL.endsWith('@demo.test') ? ROLE_CHECKS[EMAIL.split('@')[0]] : null;
    if (vp.name === 'desktop' && checks) {
      await page.goto(`${BASE}/w/${ws}/records`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const nav = await page
        .locator('[data-slot="sidebar-content"]')
        .innerText()
        .catch(() => '');
      const expectNav = (label, expected) => {
        if (nav.includes(label) !== expected) {
          problems.push(
            `[role] ws${wi}: nav "${label}" ${expected ? 'missing' : 'present'} for ${EMAIL}`,
          );
        }
      };
      expectNav('People', checks.people);
      expectNav('Talk with Cormac', checks.setupTools);

      const isLive = (await page.getByText("isn't set up yet").count()) === 0;
      if (isLive) {
        const hasCapture = (await page.locator('aside form textarea').count()) > 0;
        if (hasCapture !== checks.capture) {
          problems.push(
            `[role] ws${wi}: capture box ${checks.capture ? 'missing' : 'present'} for ${EMAIL}`,
          );
        }
        if (!checks.capture) {
          const viewingNote = await page
            .getByText('Changes waiting on a decision show here.')
            .count();
          if (viewingNote === 0) problems.push(`[role] ws${wi}: viewer note missing for ${EMAIL}`);
        }
      }

      // Direct URL must not out-privilege the nav.
      await page.goto(`${BASE}/w/${ws}/members`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const expectedMembersText = checks.people
        ? 'Who can work in this book'
        : 'Nothing to manage here';
      if ((await page.getByText(expectedMembersText).count()) === 0) {
        problems.push(
          `[role] ws${wi}: /members did not show "${expectedMembersText}" for ${EMAIL}`,
        );
      }
      console.log(`[role] ws${wi} checks done for ${EMAIL}`);
    }

    // Mobile: exercise the sidebar sheet trigger on one page.
    if (vp.name === 'mobile') {
      await page.goto(`${BASE}/w/${ws}/records`, { waitUntil: 'networkidle' });
      const trigger = page.locator('header button').first();
      if (await trigger.isVisible()) {
        await trigger.click();
        await page.waitForTimeout(450);
        await page.screenshot({ path: `${SHOTS}mobile-ws${wi}-sheet-open.png` });
        console.log(`[mobile] ws${wi} sidebar sheet opened`);
      } else {
        problems.push(`[mobile] ws${wi}: sidebar trigger not visible`);
      }
    }
  }

  // Operator console: operators get the tenant list and a detail page;
  // everyone else gets a plain nothing-here.
  if (vp.name === 'desktop' && EMAIL.endsWith('@demo.test')) {
    await page.goto(`${BASE}/operator`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (EMAIL.startsWith('operator@')) {
      if ((await page.getByText('Every tenant on this deployment.').count()) === 0) {
        problems.push(`[role] /operator did not render for ${EMAIL}`);
      }
      await page.screenshot({ path: `${SHOTS}desktop-operator-list.png` });
      const firstWorkspace = page.locator('table a').first();
      if ((await firstWorkspace.count()) > 0) {
        await firstWorkspace.click();
        await page.waitForTimeout(600);
        if ((await page.getByText('Agent tokens').count()) === 0) {
          problems.push(`[role] operator workspace detail did not render for ${EMAIL}`);
        }
        await page.screenshot({ path: `${SHOTS}desktop-operator-detail.png` });
      }
      console.log(`[role] operator console checks done for ${EMAIL}`);
    } else {
      if ((await page.getByText("There's nothing here.").count()) === 0) {
        problems.push(`[role] /operator is not hidden from ${EMAIL}`);
      }
      console.log(`[role] /operator hidden from ${EMAIL}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log('\n=== RESULT ===');
if (problems.length === 0) {
  console.log(
    `CLEAN for ${EMAIL}: no console errors, no blank pages, no page-level horizontal scroll.`,
  );
} else {
  for (const p of problems) console.log('PROBLEM:', p);
  process.exitCode = 1;
}
