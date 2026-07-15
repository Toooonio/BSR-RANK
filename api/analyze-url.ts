import axios from 'axios';
import { calculateBrandStats, parseBSRHtml } from '../server/bsrParser.js';
import type { ProductItem } from '../server/types.js';

type RequestLike = { method?: string; body?: { url?: unknown } };
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

function mergeProducts(results: ProductItem[][]): ProductItem[] {
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
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const value = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return res.status(400).json({ message: '请输入有效的 Amazon BSR 榜单 URL。' });
  }
  const isAmazonDomain = /(^|\.)amazon\.[a-z.]+$/i.test(url.hostname);
  const isBestSellersPath = /(?:\/zgbs\/|\/Best-Sellers\/|\/gp\/bestsellers\/)/i.test(url.pathname);
  if (!isAmazonDomain || !isBestSellersPath) return res.status(400).json({ message: '该链接不是可识别的 Amazon Best Sellers 榜单链接。' });

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'Accept-Language': url.hostname.endsWith('.co.uk') ? 'en-GB,en;q=0.9' : 'en-US,en;q=0.9',
    };
    const pages = [new URL(url), new URL(url)];
    pages[1].searchParams.set('pg', '2');
    const results: ProductItem[][] = [];
    for (const pageUrl of pages) {
      const response = await axios.get(pageUrl.toString(), { timeout: 25000, headers });
      results.push(parseBSRHtml(response.data, pageUrl.origin));
    }
    const products = mergeProducts(results);
    if (!products.length) throw new Error('No products parsed');
    const ranks = new Set(products.map((product) => product.rank));
    const missingRanks = Array.from({ length: 100 }, (_, index) => index + 1).filter((rank) => !ranks.has(rank));
    return res.status(200).json({ products, stats: calculateBrandStats(products), coverage: { retrieved: products.length, expected: 100, missingRanks, source: 'http' } });
  } catch {
    return res.status(422).json({ message: '当前页面无法自动抓取，可能是因为 Amazon 限制或 Vercel 网络限制。请尝试粘贴页面 HTML 或上传 CSV 文件。' });
  }
}
