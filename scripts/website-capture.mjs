#!/usr/bin/env node
/**
 * Website screenshots of the redesigned app: Expo web export (`expo export -p web --dev`) of the commit under test,
 * local demo emulators seeded with `seed-emulators.mjs` + `marketing-seed.mjs` (fictional adults only).
 * Web captures, not native iOS captures: never reuse them as App Store evidence.
 *
 *   node scripts/website-capture.mjs <outDir> [--theme light|dark] [--base http://127.0.0.1:8091] [--only name,name]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const out = path.resolve(args[0] ?? 'website-captures');
const theme = opt('--theme', 'light');
const base = opt('--base', 'http://127.0.0.1:8091');
const only = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const accounts = JSON.parse(fs.readFileSync('e2e/fixtures/accounts.json', 'utf8'));
const demo = JSON.parse(fs.readFileSync('e2e/fixtures/marketing-demo.json', 'utf8'));
const mara = demo.players[0];
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const records = [];
const errors = [];

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB',
    reducedMotion: 'reduce', colorScheme: theme });
  await ctx.addInitScript((t) => localStorage.setItem('@scoutx/theme-preference', t), theme);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  return { ctx, page };
}
async function signIn(page, email) {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Home' }).waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('button', { name: 'I already have an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(accounts.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ state: 'hidden', timeout: 30_000 });
}
/** Scrolls the nearest scroll container so that the visible element with `text` sits `offset` px below the top. */
const scrollTo = (text, offset = 12) => async (p) => {
  const el = p.getByText(text, { exact: true }).filter({ visible: true }).first();
  await el.waitFor({ timeout: 60_000 });
  await el.evaluate((node, off) => {
    let s = node.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    const target = s ?? document.scrollingElement;
    const top = node.getBoundingClientRect().top - (s ? s.getBoundingClientRect().top : 0);
    target.scrollTop += top - off;
  }, offset);
  await p.waitForTimeout(600);
};
async function shot(page, name, route, ready, { full = false, before } = {}) {
  if (only.length && !only.includes(name)) return;
  if (route) await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
  if (ready) await page.getByText(ready, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 90_000 });
  if (before) await before(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full, animations: 'disabled' });
  records.push({ file: `${name}.png`, route: route ?? page.url().replace(base, ''), theme, viewport: '390x844@2x', fullPage: full });
  console.log('captured', name);
}

// player (owner) views
{
  const { ctx, page } = await newPage();
  await signIn(page, mara.email);
  await shot(page, 'player-today', '/player/home', mara.name);
  await shot(page, 'player-passport', '/player/home', mara.name, { before: async (p) => {
    await p.getByRole('tab', { name: 'Passport' }).first().click().catch(() => p.getByText('Passport', { exact: true }).first().click());
  } });
  await shot(page, 'player-performance', '/player/performance?segment=stats', 'Match history', { before: scrollTo('Reflect on your last match', 16) });
  await shot(page, 'player-development', '/player/performance?segment=development', 'Goal', { before: scrollTo('Goals', 96) });
  await shot(page, 'player-media', '/player/media', 'Media');
  await ctx.close();
}
// public Passport as a visitor
{
  const { ctx, page } = await newPage();
  await shot(page, 'public-passport', `/player/${mara.username}`, mara.name, { before: scrollTo('Unverified', 44) });
  await ctx.close();
}
// scout views
{
  const { ctx, page } = await newPage();
  await signIn(page, accounts.scout.email);
  await shot(page, 'scout-discover', '/scout/discover', 'Discover', { before: scrollTo('5 players found', 140) });
  await shot(page, 'scout-player', '/scout/discover', mara.name, { before: async (p) => {
    await p.getByText(mara.name, { exact: false }).filter({ visible: true }).first().click();
    await p.waitForTimeout(1500);
  } });
  await shot(page, 'scout-pipeline', '/scout/pipeline', 'Pipeline');
  await ctx.close();
}
await browser.close();

const commit = execSync('git rev-parse HEAD').toString().trim();
const dirty = execSync('git status --porcelain -- src app package.json').toString().trim() !== '';
fs.writeFileSync(path.join(out, 'capture-manifest.json'), JSON.stringify({
  capturedAt: new Date().toISOString(), appCommit: commit, appSourceDirty: dirty, platform: 'Expo web (static --dev export), Chromium',
  notNative: 'Web captures of the app; not native iOS screenshots and not App Store evidence',
  backend: 'local Firebase demo emulators (project demo-scoutx)', fixtures: ['e2e/fixtures/accounts.json', 'e2e/fixtures/marketing-demo.json'],
  demonstrationData: 'fictional adult players; self-reported demonstration match lines; no real people, footage or contact details',
  theme, locale: 'en-GB', captures: records.map((r) => ({ ...r, sha256: createHash('sha256').update(fs.readFileSync(path.join(out, r.file))).digest('hex') })),
  pageErrors: errors,
}, null, 2) + '\n');
console.log(`done: ${records.length} captures, ${errors.length} page errors`);
