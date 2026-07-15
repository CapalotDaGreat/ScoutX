import { chromium, devices } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8090';
const outDir = path.join(process.cwd(), 'tmp', 'ui-review');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Pixel 7'],
  });
  const page = await context.newPage();
  page.on('console', (msg) => console.log('console:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('pageerror:', err.message));

  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(outDir, '00-initial.png'), fullPage: true });
  const bodyText = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(outDir, '00-body.txt'), bodyText.slice(0, 4000));
  console.log('Body sample:\n', bodyText.slice(0, 800));

  // Try guest if available
  const guest = page.getByRole('button', { name: /guest/i });
  if (await guest.isVisible().catch(() => false)) {
    await guest.click();
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(outDir, '02-after-guest.png'), fullPage: true });
    const after = await page.locator('body').innerText().catch(() => '');
    fs.writeFileSync(path.join(outDir, '02-body.txt'), after.slice(0, 4000));
  }

  await browser.close();
  console.log(`Saved to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
