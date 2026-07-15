import { readFileSync } from 'node:fs';

const html = readFileSync('work/uk-fashion-standard-pg1.html', 'utf8');
for (const pattern of [/[^"'\s]{0,100}p13n[^"'\s]{0,200}/gi, /[^"'\s]{0,100}ajax[^"'\s]{0,200}/gi, /[^"'\s]{0,100}pagination[^"'\s]{0,200}/gi]) {
  const matches = html.match(pattern) ?? [];
  console.log(pattern, matches.slice(0, 20));
}
