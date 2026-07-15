import { chromium } from 'playwright-core';
import { parseBSRHtml } from '../server/bsrParser.js';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--disable-blink-features=AutomationControlled'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1200 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  locale: 'en-GB',
});
await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
await page.goto('https://www.amazon.co.uk/Best-Sellers-Fashion-Mens-Sports-Outdoor-Sandals/zgbs/fashion/1769742031/ref=zg_bs_pg_1_fashion?_encoding=UTF8&pg=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
for (let index = 0; index < 10; index += 1) {
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(700);
}
const html = await page.content();
console.log('title', await page.title());
console.log('products', parseBSRHtml(html, 'https://www.amazon.co.uk').map((product) => product.rank));
await browser.close();
