const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setStatus(message, error = false) {
  await chrome.storage.local.set({ collectionStatus: { message, error, updatedAt: Date.now() } });
}

async function waitForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('The second BSR page did not finish loading.'));
    }, 30000);
    const listener = (updatedId, info) => {
      if (updatedId !== tabId || info.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 1600);
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function collectFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'COLLECT_BSR_PAGE' });
  } catch (error) {
    if (!/Receiving end does not exist/i.test(error instanceof Error ? error.message : '')) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await sleep(250);
    return chrome.tabs.sendMessage(tabId, { type: 'COLLECT_BSR_PAGE' });
  }
}

async function gzipToBase64(value) {
  const stream = new Blob([new TextEncoder().encode(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function collectTop100(analyzerUrl) {
  const [firstTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!firstTab?.id || !/amazon\./i.test(firstTab.url || '')) throw new Error('Open an Amazon Best Sellers page before collecting.');
  await setStatus('Collecting the first 50 products...');
  let first = await collectFromTab(firstTab.id);
  if (first.error || !first.products?.length) throw new Error(first.error || 'No ranked products found on the first page.');

  if (first.currentPage === 2) {
    const firstPageUrl = new URL(firstTab.url);
    firstPageUrl.searchParams.set('pg', '1');
    await chrome.tabs.update(firstTab.id, { url: firstPageUrl.toString(), active: true });
    await waitForTab(firstTab.id);
    first = await collectFromTab(firstTab.id);
    if (first.error || !first.products?.length) throw new Error(first.error || 'No ranked products found on the first page.');
  }

  await setStatus('Opening and collecting the second 50 products...');
  const secondTab = await chrome.tabs.create({ url: first.secondPageUrl, active: true });
  await waitForTab(secondTab.id);
  const second = await collectFromTab(secondTab.id);
  if (second.error || !second.products?.length) throw new Error(second.error || 'No ranked products found on the second page.');

  const merged = new Map([...first.products, ...second.products].map((product) => [product.rank, product]));
  const products = [...merged.values()].sort((a, b) => a.rank - b.rank);
  if (products.length !== 100 || products.some((product, index) => product.rank !== index + 1)) {
    throw new Error(`Collected ${products.length}/100 continuous ranks. Refresh the Amazon page and try again.`);
  }

  await setStatus('Opening the analyzer with 100 verified products...');
  const payload = await gzipToBase64(JSON.stringify(products));
  await chrome.tabs.update(secondTab.id, { url: `${analyzerUrl.replace(/\/$/, '')}/#extension-data=${payload}`, active: true });
  await setStatus('Complete: 100 verified products were imported.');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'START_COLLECTION') return undefined;
  collectTop100(message.analyzerUrl)
    .catch((error) => setStatus(error instanceof Error ? error.message : 'Collection failed.', true));
  sendResponse({ started: true });
  return true;
});
