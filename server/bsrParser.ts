import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { BrandStats, ProductItem } from './types.js';

function clean(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value?: string, origin = 'https://www.amazon.com'): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
}

export function inferBrand(title: string): string {
  const text = clean(title);
  if (!text) return 'Unknown';
  const ignored = new Set(['the', 'new', 'for', 'with', 'best', 'amazon', 'pack', 'set', 'product', 'products', 'shoes', 'shoe', 'sandals', 'maker', 'makers', 'ice', 'portable', 'countertop', 'mens', "men's", 'womens', "women's", 'girls', 'boys', 'kids', 'toddler', 'dress', 'walking', 'outdoor', 'adult', 'unisex']);
  const brandTailWords = new Set(['pairs', 'warehouse', 'marc', 'swift', 'john', 'paul', 'jones', 'smith', 'lee', 'west', 'coast', 'stone', 'eagle', 'house', 'line', 'life', 'tech']);
  const words = text.split(' ').filter(Boolean);
  if (!words.length || ignored.has(words[0].toLowerCase())) return 'Unknown';
  if (words.length > 1) {
    const first = words[0].replace(/[^\p{L}\p{N}&'-]/gu, '');
    const second = words[1].replace(/[^\p{L}\p{N}&'-]/gu, '');
    const allCapsOrNumeric = /^[A-Z0-9&-]{1,}$/.test(first) && /^[A-Z0-9&-]{1,}$/.test(second);
    const titleCaseBrand = /^[A-Z][\p{L}\p{N}&'-]*$/u.test(first) && brandTailWords.has(second.toLowerCase());
    if (second && !ignored.has(second.toLowerCase()) && (allCapsOrNumeric || titleCaseBrand || /^\d+$/.test(second))) {
      return `${first} ${second}`;
    }
  }
  return words[0].replace(/[^\p{L}\p{N}&'-]/gu, '') || 'Unknown';
}

function findRank($: cheerio.CheerioAPI, card: cheerio.Cheerio<Element>, fallback: number): number {
  const fromBadge = clean(card.find('.zg-bdg-text').first().text())
    || clean(card.find('[data-rank]').first().attr('data-rank'))
    || card.attr('data-rank')
    || '';
  const matched = fromBadge.match(/#?\s*(\d{1,3})/);
  return matched ? Number(matched[1]) : fallback;
}

function findTitle($: cheerio.CheerioAPI, card: cheerio.Cheerio<Element>): string {
  const imageAlt = clean(card.find('img').first().attr('alt'));
  const titled = clean(card.find('[data-title], h2, h3, .p13n-sc-truncate, .a-link-normal span').first().attr('data-title'));
  const text = clean(card.find('h2, h3, .p13n-sc-truncate, .a-link-normal span').first().text());
  return imageAlt || titled || text;
}

export function parseBSRHtml(html: string, origin?: string): ProductItem[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, cheerio.Cheerio<Element>>();
  const cards = $('[data-asin]').length
    ? $('[data-asin]')
    : $('.zg-grid-general-faceout, .zg-item-immersion, li.zg-item-immersion');
  cards.each((_, element) => {
    const card = $(element);
    const url = card.find('a[href*="/dp/"]').first().attr('href') ?? '';
    const title = findTitle($, card);
    if (title || url) candidates.set(`${url}|${title}`, card);
  });

  const products: ProductItem[] = [];
  const usedRanks = new Set<number>();
  Array.from(candidates.values()).forEach((card, index) => {
    let rank = findRank($, card, index + 1);
    while (usedRanks.has(rank)) rank += 1;
    if (rank < 1 || rank > 100) return;
    const url = absoluteUrl(card.find('a[href*="/dp/"]').first().attr('href'), origin);
    const asin = card.attr('data-asin') || url?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
    const title = findTitle($, card) || `Product rank ${rank}`;
    const directBrand = clean(card.find('[data-brand], .brand, [class*="brand"]').first().attr('data-brand')) || clean(card.find('[data-brand], .brand, [class*="brand"]').first().text());
    products.push({
      rank,
      title,
      brand: directBrand || inferBrand(title),
      asin: asin?.toUpperCase(),
      url,
      image: card.find('img').first().attr('src'),
    });
    usedRanks.add(rank);
  });

  // Pasted plain-text lists remain useful when the source is not a full DOM export.
  if (!products.length) {
    html.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*#?\s*(\d{1,3})[.、:\s-]+(.+)/);
      if (!match) return;
      const rank = Number(match[1]);
      if (rank < 1 || rank > 100 || usedRanks.has(rank)) return;
      const title = clean(match[2]);
      const asin = title.match(/\b([A-Z0-9]{10})\b/i)?.[1]?.toUpperCase();
      products.push({ rank, title, brand: inferBrand(title), asin });
      usedRanks.add(rank);
    });
  }

  return products.sort((a, b) => a.rank - b.rank).slice(0, 100);
}

export function calculateBrandStats(products: ProductItem[]): BrandStats[] {
  const valid = products.filter((product) => product.rank >= 1 && product.rank <= 100);
  const counts = new Map<string, Omit<BrandStats, 'percentage'>>();
  valid.forEach((product) => {
    const brand = clean(product.brand) || 'Unknown';
    const entry = counts.get(brand) ?? { brand, top1To10: 0, top11To30: 0, top31To50: 0, top51To100: 0, top31To100: 0, total: 0 };
    if (product.rank <= 10) entry.top1To10 += 1;
    else if (product.rank <= 30) entry.top11To30 += 1;
    else if (product.rank <= 50) entry.top31To50 += 1;
    else entry.top51To100 += 1;
    entry.top31To100 = entry.top31To50 + entry.top51To100;
    entry.total += 1;
    counts.set(brand, entry);
  });
  return Array.from(counts.values())
    .map((entry) => ({ ...entry, percentage: valid.length ? Number(((entry.total / valid.length) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.total - a.total || b.top1To10 - a.top1To10 || b.top11To30 - a.top11To30 || a.brand.localeCompare(b.brand));
}
