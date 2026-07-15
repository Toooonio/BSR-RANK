import { calculateBrandStats, parseBSRHtml } from '../server/bsrParser.js';

type RequestLike = { method?: string; body?: { html?: unknown } };
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

export default function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const html = typeof req.body?.html === 'string' ? req.body.html : '';
  if (!html.trim()) return res.status(400).json({ message: '请粘贴需要解析的 HTML 或商品列表文本。' });
  const products = parseBSRHtml(html);
  if (!products.length) return res.status(422).json({ message: '未识别到商品。请确认粘贴的是 BSR 榜单页面 HTML，或使用 CSV 导入。' });
  return res.status(200).json({ products, stats: calculateBrandStats(products) });
}
