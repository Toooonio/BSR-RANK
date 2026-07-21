import * as XLSX from 'xlsx';
import type { BrandStats, ProductItem } from './types';

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function inferBrand(title: string): string {
  const words = clean(title).split(' ').filter(Boolean);
  const ignored = new Set(['the', 'new', 'for', 'with', 'amazon', 'product', 'products', 'shoes', 'shoe', 'sandals', 'maker', 'makers', 'ice', 'portable', 'countertop', 'mens', "men's", 'womens', "women's", 'girls', 'boys', 'kids', 'toddler', 'dress', 'walking', 'outdoor', 'adult', 'unisex']);
  const brandTailWords = new Set(['pairs', 'warehouse', 'marc', 'swift', 'john', 'paul', 'jones', 'smith', 'lee', 'west', 'coast', 'stone', 'eagle', 'house', 'line', 'life', 'tech']);
  const first = words[0]?.replace(/[^\p{L}\p{N}&'-]/gu, '');
  const second = words[1]?.replace(/[^\p{L}\p{N}&'-]/gu, '');
  if (!first || ignored.has(first.toLowerCase())) return 'Unknown';
  const allCapsOrNumeric = !!second && /^[A-Z0-9&-]{1,}$/.test(first) && /^[A-Z0-9&-]{1,}$/.test(second);
  const titleCaseBrand = !!second && /^[A-Z][\p{L}\p{N}&'-]*$/u.test(first) && brandTailWords.has(second.toLowerCase());
  if (second && !ignored.has(second.toLowerCase()) && (allCapsOrNumeric || titleCaseBrand || /^\d+$/.test(second))) return `${first} ${second}`;
  return first;
}

export function calculateBrandStats(products: ProductItem[]): BrandStats[] {
  const valid = products.filter((product) => product.rank >= 1 && product.rank <= 100);
  const map = new Map<string, BrandStats>();
  valid.forEach((product) => {
    const brand = clean(product.brand) || 'Unknown';
    const record = map.get(brand) ?? { brand, topRank1: 0, top2To10: 0, top11To30: 0, top31To50: 0, top51To100: 0, top31To100: 0, total: 0, percentage: 0 };
    if (product.rank === 1) record.topRank1 += 1;
    else if (product.rank <= 10) record.top2To10 += 1;
    else if (product.rank <= 30) record.top11To30 += 1;
    else if (product.rank <= 50) record.top31To50 += 1;
    else record.top51To100 += 1;
    record.top31To100 = record.top31To50 + record.top51To100;
    record.total += 1;
    map.set(brand, record);
  });
  return [...map.values()]
    .map((record) => ({ ...record, percentage: valid.length ? Number((record.total / valid.length * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.total - a.total || b.topRank1 - a.topRank1 || b.top2To10 - a.top2To10 || b.top11To30 - a.top11To30 || a.brand.localeCompare(b.brand));
}

export function parseCsvRows(rows: Record<string, unknown>[]): ProductItem[] {
  const products: ProductItem[] = [];
  const usedRanks = new Set<number>();
  rows.forEach((row) => {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value]));
    const rank = Number(normalized.rank ?? normalized['排名']);
    const title = clean(normalized.title ?? normalized['商品标题'] ?? normalized.name);
    if (!Number.isInteger(rank) || rank < 1 || rank > 100 || !title || usedRanks.has(rank)) return;
    products.push({
      rank,
      title,
      brand: clean(normalized.brand ?? normalized['品牌']) || inferBrand(title),
      asin: clean(normalized.asin ?? normalized['asin码']) || undefined,
      url: clean(normalized.url ?? normalized.link ?? normalized['商品链接']) || undefined,
      image: clean(normalized.image ?? normalized['图片链接']) || undefined,
    });
    usedRanks.add(rank);
  });
  return products.sort((a, b) => a.rank - b.rank);
}

function download(blob: Blob, name: string) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function exportData(format: 'csv' | 'json' | 'xlsx', products: ProductItem[], stats: BrandStats[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const statsRows = stats.map((row) => ({ '品牌': row.brand, '1数量': row.topRank1, '2-10数量': row.top2To10, '11-30数量': row.top11To30, '31-50数量': row.top31To50, '51-100数量': row.top51To100, '31-100数量': row.top31To100, '总数量': row.total, '占比': `${row.percentage}%` }));
  const productRows = products.map((row) => ({ '排名': row.rank, '品牌': row.brand, '商品标题': row.title, 'ASIN': row.asin ?? '', '商品链接': row.url ?? '', '图片链接': row.image ?? '' }));
  if (format === 'json') {
    download(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), brandStats: stats, products, rawParsedData: products }, null, 2)], { type: 'application/json' }), `bsr-brand-analysis-${stamp}.json`);
    return;
  }
  if (format === 'csv') {
    const combined = [`品牌统计`, XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(statsRows)), '', '商品明细', XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(productRows))].join('\n');
    download(new Blob(['\uFEFF' + combined], { type: 'text/csv;charset=utf-8' }), `bsr-brand-analysis-${stamp}.csv`);
    return;
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(statsRows), '品牌统计');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productRows), '商品明细');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(products), '原始解析数据');
  XLSX.writeFile(workbook, `bsr-brand-analysis-${stamp}.xlsx`);
}
