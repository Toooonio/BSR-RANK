import { chromium } from 'playwright-core';
import { parseBSRHtml } from './bsrParser.js';
import type { ProductItem } from './types.js';

const chromePath = process.env.CHROME_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function scrapeBSRBrowserPage(url: URL): Promise<ProductItem[]> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      locale: url.hostname.endsWith('.co.uk') ? 'en-GB' : 'en-US',
    });
    await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    for (let index = 0; index < 24; index += 1) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(750);
      if (await page.locator('[data-asin]').count() >= 50) break;
    }
    return parseBSRHtml(await page.content(), url.origin);
  } finally {
    await browser.close();
  }
}
