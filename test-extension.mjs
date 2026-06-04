import { chromium } from 'playwright';
import { createServer } from 'http';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ENCODED_DESC = "Rainier%20Snap%20Kickstand%20Case%20%7C%20iPhone%2017e%2F16e%2F15%2F14%2F13%20%EF%BC%9A%20Ultimate%2C%20Rugged%2C%20Dual-layer%2C%20Magnetic%20Case%0ARainier%20is%20extreme%20protection%20with%20a%20kickstand.";

const HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="shopify-checkout-api-token" content="fake-token">
  <title>Test Product</title>
  <script type="application/ld+json">
  {
    "@type": "Product",
    "name": "Rainier Snap Kickstand Case",
    "description": "${ENCODED_DESC}",
    "offers": { "@type": "Offer", "price": "59.99", "priceCurrency": "USD" }
  }
  <\/script>
</head>
<body><h1>Rainier Snap Kickstand Case</h1></body>
</html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});
await new Promise(r => server.listen(9988, r));
console.log('Test server on http://localhost:9988');

const extensionPath = '/Users/alizain/Downloads/shopify-crabber/dist';
const profileDir = mkdtempSync(join(tmpdir(), 'pw-ext-'));
console.log('Profile dir:', profileDir);

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel: 'chrome',
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
  ],
});

// Open a blank page immediately to trigger service worker registration
const triggerPage = await context.newPage();
await triggerPage.goto('about:blank');
await triggerPage.waitForTimeout(1000);

let extensionId = null;

// Check existing workers
for (const worker of context.serviceWorkers()) {
  if (worker.url().startsWith('chrome-extension://')) {
    extensionId = worker.url().split('/')[2];
    console.log('Extension ID (immediate):', extensionId);
    break;
  }
}

if (!extensionId) {
  // Wait for it
  try {
    const sw = await context.waitForEvent('serviceworker', { timeout: 8000 });
    extensionId = sw.url().split('/')[2];
    console.log('Extension ID (event):', extensionId);
  } catch {
    console.log('Service worker event timed out, checking again...');
    for (const worker of context.serviceWorkers()) {
      if (worker.url().startsWith('chrome-extension://')) {
        extensionId = worker.url().split('/')[2];
        console.log('Extension ID (retry):', extensionId);
        break;
      }
    }
  }
}

if (!extensionId) {
  console.error('Could not get extension ID');
  await context.close();
  server.close();
  process.exit(1);
}

await triggerPage.close();

// Navigate to test product page (this is what the popup will scrape)
const page = await context.newPage();
await page.bringToFront();
await page.goto('http://localhost:9988');
await page.waitForLoadState('domcontentloaded');
console.log('Test page loaded');

// Open popup directly
const popupPage = await context.newPage();
await popupPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
await popupPage.waitForLoadState('domcontentloaded');
await new Promise(r => setTimeout(r, 1500));

await popupPage.screenshot({ path: '/tmp/popup-initial.png' });
console.log('Screenshot: /tmp/popup-initial.png');

const buttons = popupPage.locator('button');
const count = await buttons.count();
const texts = await buttons.allTextContents();
console.log(`Buttons (${count}):`, texts);

if (count > 0) {
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const t = (texts[i] || '').toLowerCase();
    if (t.includes('scrape') || t.includes('grab') || t.includes('extract') || t.includes('crab') || t.includes('get')) {
      await buttons.nth(i).click();
      clicked = true;
      console.log(`Clicked: "${texts[i]}"`);
      break;
    }
  }
  if (!clicked) {
    await buttons.first().click();
    console.log(`Clicked first: "${texts[0]}"`);
  }

  await new Promise(r => setTimeout(r, 3000));
  await popupPage.screenshot({ path: '/tmp/popup-after-scrape.png' });
  console.log('Post-scrape screenshot: /tmp/popup-after-scrape.png');
}

const bodyText = await popupPage.locator('body').textContent();
console.log('\n--- POPUP TEXT ---');
console.log(bodyText?.substring(0, 800));

console.log('\n--- VERDICT ---');
if (bodyText?.includes('%20') || bodyText?.includes('%0A') || bodyText?.includes('%7C')) {
  console.log('FAIL: URL-encoded characters still present in popup');
} else if (bodyText?.toLowerCase().includes('rainier')) {
  console.log('PASS: Description decoded — no %XX sequences, product name visible');
} else {
  console.log('INCONCLUSIVE');
}

await context.close();
server.close();
