import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';

const file = process.argv[2] || 'work/uk-fashion.html';
const $ = cheerio.load(readFileSync(file, 'utf8'));
const selectors = [
  '[data-asin]',
  '.zg-grid-general-faceout',
  '.zg-item-immersion',
  'li.zg-item-immersion',
  '[id^="gridItemRoot"]',
  '.p13n-sc-uncoverable-faceout',
  'a[href*="/dp/"]',
  '.zg-bdg-text',
];

selectors.forEach((selector) => console.log(selector, $(selector).length));
console.log('badges', $('.zg-bdg-text').slice(0, 5).map((_, node) => $(node).text().trim()).get());
console.log('pages', $('a[href*="pg="]').slice(0, 20).map((_, node) => $(node).attr('href')).get());
const firstProduct = $('[data-asin]').first();
console.log('first product rank descendants', firstProduct.find('.zg-bdg-text').length);
console.log('ancestor ranks', firstProduct.parents().slice(0, 6).map((_, node) => $(node).find('.zg-bdg-text').first().text().trim()).get());
console.log('grid ranks', $('.zg-grid-general-faceout').slice(0, 5).map((_, node) => $(node).find('.zg-bdg-text').first().text().trim()).get());
