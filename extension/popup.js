const analyzerInput = document.getElementById('analyzer-url');
const collectButton = document.getElementById('collect');
const status = document.getElementById('status');

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.className = isError ? 'error' : '';
};

collectButton.addEventListener('click', async () => {
  const analyzerUrl = analyzerInput.value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(analyzerUrl)) return setStatus('Enter your deployed Vercel analyzer URL.', true);
  collectButton.disabled = true;
  setStatus('Collecting the first 50 products...');
  try {
    await chrome.storage.local.set({ analyzerUrl });
    await chrome.runtime.sendMessage({ type: 'START_COLLECTION', analyzerUrl });
    setStatus('Collection started. Keep the Amazon tabs open until the analyzer opens.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Collection failed.', true);
    collectButton.disabled = false;
  }
});

chrome.storage.local.get('analyzerUrl').then(({ analyzerUrl }) => {
  if (analyzerUrl) analyzerInput.value = analyzerUrl;
});

chrome.storage.onChanged.addListener((changes) => {
  const update = changes.collectionStatus?.newValue;
  if (update) setStatus(update.message, update.error);
});
