(() => {
  if (window.__amazonBsrCollectorLoaded) return;
  window.__amazonBsrCollectorLoaded = true;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();

  function inferBrand(title) {
    const words = clean(title).split(' ').filter(Boolean);
    const ignored = new Set(['the', 'new', 'for', 'with', 'amazon', 'product', 'products', 'shoes', 'shoe', 'sandals', 'maker', 'makers', 'ice', 'portable', 'countertop', 'mens', "men's", 'womens', "women's", 'girls', 'boys', 'kids', 'toddler', 'dress', 'walking', 'outdoor', 'adult', 'unisex']);
    const brandTailWords = new Set(['pairs', 'warehouse', 'marc', 'swift', 'john', 'paul', 'jones', 'smith', 'lee', 'west', 'coast', 'stone', 'eagle', 'house', 'line', 'life', 'tech']);
    const first = words[0]?.replace(/[^\p{L}\p{N}&'-]/gu, '');
    const second = words[1]?.replace(/[^\p{L}\p{N}&'-]/gu, '');
    if (!first || ignored.has(first.toLowerCase())) return 'Unknown';
    const allCapsOrNumeric = !!second && /^[A-Z0-9&-]{1,}$/.test(first) && /^[A-Z0-9&-]{1,}$/.test(second);
    const titleCaseBrand = !!second && /^[A-Z][\p{L}\p{N}&'-]*$/u.test(first) && brandTailWords.has(second.toLowerCase());
    return second && !ignored.has(second.toLowerCase()) && (allCapsOrNumeric || titleCaseBrand || /^\d+$/.test(second)) ? `${first} ${second}` : first;
  }

  function collectProducts() {
    const cards = [...document.querySelectorAll('[data-asin]')];
    const byRank = new Map();
    cards.forEach((card) => {
      const rankText = clean(card.querySelector('.zg-bdg-text')?.textContent);
      const rank = Number(rankText.match(/\d+/)?.[0]);
      const link = card.querySelector('a[href*="/dp/"]')?.href;
      const image = card.querySelector('img');
      const title = clean(image?.alt) || clean(card.querySelector('.p13n-sc-truncate, h2, h3, a span')?.textContent);
      if (!rank || rank < 1 || rank > 100 || !title) return;
      const asin = card.dataset.asin || link?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
      byRank.set(rank, { rank, title, brand: inferBrand(title), asin, url: link, image: image?.src });
    });
    return [...byRank.values()].sort((a, b) => a.rank - b.rank);
  }

  async function scrollForProducts() {
    let products = collectProducts();
    for (let index = 0; index < 28 && products.length < 50; index += 1) {
      window.scrollBy(0, 900);
      await sleep(700);
      products = collectProducts();
    }
    return products;
  }

  function secondPageUrl() {
    const link = [...document.querySelectorAll('a[href*="pg=2"]')]
      .map((anchor) => anchor.href)
      .find((href) => /zg_bs_pg_2|[?&]pg=2/i.test(href));
    if (link) return link;
    const url = new URL(location.href);
    url.searchParams.set('pg', '2');
    return url.toString();
  }

  function currentPageNumber() {
    return Number(new URL(location.href).searchParams.get('pg') || '1');
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'COLLECT_BSR_PAGE') return undefined;
    scrollForProducts()
      .then((products) => sendResponse({ products, secondPageUrl: secondPageUrl(), currentPage: currentPageNumber(), currentUrl: location.href }))
      .catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Unable to collect this page.' }));
    return true;
  });
})();
