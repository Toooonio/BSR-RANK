import axios from 'axios';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { scrapeBSRBrowserPage } from './browserScraper.js';
import { calculateBrandStats, parseBSRHtml } from './bsrParser.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.post('/api/parse-html', (req, res) => {
  const html = typeof req.body?.html === 'string' ? req.body.html : '';
  if (!html.trim()) return res.status(400).json({ message: '请粘贴需要解析的 HTML 或商品列表文本。' });
  const products = parseBSRHtml(html);
  if (!products.length) return res.status(422).json({ message: '未识别到商品。请确认粘贴的是 BSR 榜单页面 HTML，或使用 CSV 导入。' });
  res.json({ products, stats: calculateBrandStats(products) });
});

app.post('/api/analyze-url', async (req, res) => {
  const value = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return res.status(400).json({ message: '请输入有效的 Amazon BSR 榜单 URL。' });
  }
  const isAmazonDomain = /(^|\.)amazon\.[a-z.]+$/i.test(url.hostname);
  const isBestSellersPath = /(?:\/zgbs\/|\/Best-Sellers\/|\/gp\/bestsellers\/)/i.test(url.pathname);
  if (!isAmazonDomain || !isBestSellersPath) {
    return res.status(400).json({ message: '该链接不是可识别的 Amazon Best Sellers 榜单链接。' });
  }
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'Accept-Language': url.hostname.endsWith('.co.uk') ? 'en-GB,en;q=0.9' : 'en-US,en;q=0.9',
    };
    const firstResponse = await axios.get(url.toString(), { timeout: 15000, headers });
    const pageResults = [parseBSRHtml(firstResponse.data, url.origin)];
    for (let page = 2; page <= 2; page += 1) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('pg', String(page));
      try {
        const response = await axios.get(pageUrl.toString(), { timeout: 15000, headers });
        const pageProducts = parseBSRHtml(response.data, pageUrl.origin);
        if (!pageProducts.length) break;
        pageResults.push(pageProducts);
      } catch {
        break;
      }
    }
    const mergeProducts = (results: typeof pageResults) => {
      const seen = new Set<string>();
      return results.flat()
      .sort((a, b) => a.rank - b.rank)
      .filter((product) => {
        const key = product.asin || product.url || `${product.rank}:${product.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 100);
    };
    let products = mergeProducts(pageResults);
    let source = 'http';
    const hasCompleteTop100 = products.length === 100 && products.every((product, index) => product.rank === index + 1);
    if (!hasCompleteTop100) {
      try {
        const browserPages = [new URL(url), new URL(url)];
        browserPages[1].searchParams.set('pg', '2');
        const browserResults = [];
        for (const pageUrl of browserPages) browserResults.push(await scrapeBSRBrowserPage(pageUrl));
        products = mergeProducts(browserResults);
        source = 'browser';
      } catch (browserError) {
        console.warn('Browser fallback unavailable:', browserError instanceof Error ? browserError.message : browserError);
      }
    }
    if (!products.length) throw new Error('No products parsed');
    const foundRanks = new Set(products.map((product) => product.rank));
    const missingRanks = Array.from({ length: 100 }, (_, index) => index + 1).filter((rank) => !foundRanks.has(rank));
    res.json({
      products,
      stats: calculateBrandStats(products),
      coverage: { retrieved: products.length, expected: 100, missingRanks, source },
    });
  } catch {
    res.status(422).json({ message: '当前页面无法自动抓取，可能是因为亚马逊反爬限制。请尝试粘贴页面 HTML 或上传 CSV 文件。' });
  }
});

const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => console.log(`BSR API running on http://localhost:${port}`));
