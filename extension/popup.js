const analyzerInput = document.getElementById('analyzer-url');
const collectButton = document.getElementById('collect');
const status = document.getElementById('status');

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.className = isError ? 'error' : '';
};

async function messageTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('The second BSR page did not finish loading.'));
    }, 30000);
    const listener = (updatedId, info) => {
      if (updatedId !== tabId || info.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(resolve, 1200);
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function gzipToBase64(value) {
  const stream = new Blob([new TextEncoder().encode(value)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

collectButton.addEventListener('click', async () => {
  const analyzerUrl = analyzerInput.value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(analyzerUrl)) return setStatus('Enter your deployed Vercel analyzer URL.', true);
  collectButton.disabled = true;
  setStatus('Collecting the first 50 products...');
  try {
    await chrome.storage.local.set({ analyzerUrl });
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id || !/amazon\./i.test(activeTab.url || '')) throw new Error('Open an Amazon Best Sellers page before collecting.');
    const first = await messageTab(activeTab.id, { type: 'COLLECT_BSR_PAGE' });
    if (first.error || !first.products?.length) throw new Error(first.error || 'No ranked products found on the first page.');
    setStatus('Collecting the second 50 products...');
    const secondTab = await chrome.tabs.create({ url: first.secondPageUrl, active: false });
    await waitForTab(secondTab.id);
    const second = await messageTab(secondTab.id, { type: 'COLLECT_BSR_PAGE' });
    await chrome.tabs.remove(secondTab.id);
    if (second.error || !second.products?.length) throw new Error(second.error || 'No ranked products found on the second page.');
    const merged = new Map([...first.products, ...second.products].map((product) => [product.rank, product]));
    const products = [...merged.values()].sort((a, b) => a.rank - b.rank);
    if (products.length !== 100 || products.some((product, index) => product.rank !== index + 1)) throw new Error(`Collected ${products.length}/100 continuous ranks. Refresh the Amazon page and try again.`);
    setStatus('Opening the analyzer with 100 verified products...');
    const payload = await gzipToBase64(JSON.stringify(products));
    await chrome.tabs.create({ url: `${analyzerUrl}/#extension-data=${payload}`, active: true });
    window.close();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Collection failed.', true);
    collectButton.disabled = false;
  }
});

chrome.storage.local.get('analyzerUrl').then(({ analyzerUrl }) => {
  if (analyzerUrl) analyzerInput.value = analyzerUrl;
});
