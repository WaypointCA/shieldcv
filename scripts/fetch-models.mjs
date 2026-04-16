import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const modelsRoot = path.join(repoRoot, 'apps/web/static/models');

// Update these pinned SHAs when intentionally moving to newer model revisions.
const BERT_BASE_NER_SHA = '24c7e5aba9ae350923357a6f0b92571be34037ec';
const ALL_MINILM_L6_V2_SHA = '751bff37182d3f1213fa05d7196b954e230abad9';

const manifest = [
  {
    modelId: 'Xenova/bert-base-NER',
    revision: BERT_BASE_NER_SHA,
    files: [
      { path: 'config.json', expectedBytes: 999 },
      { path: 'tokenizer.json', expectedBytes: 668_923 },
      { path: 'tokenizer_config.json', expectedBytes: 385 },
      { path: 'special_tokens_map.json', expectedBytes: 125 },
      { path: 'onnx/model_quantized.onnx', expectedBytes: 108_952_255 },
    ],
  },
  {
    modelId: 'Xenova/all-MiniLM-L6-v2',
    revision: ALL_MINILM_L6_V2_SHA,
    files: [
      { path: 'config.json', expectedBytes: 650 },
      { path: 'tokenizer.json', expectedBytes: 711_661 },
      { path: 'tokenizer_config.json', expectedBytes: 366 },
      { path: 'special_tokens_map.json', expectedBytes: 125 },
      { path: 'onnx/model_quantized.onnx', expectedBytes: 22_972_370 },
    ],
  },
];

function modelUrl(modelId, revision, filePath) {
  return `https://huggingface.co/${modelId}/resolve/${revision}/${filePath}`;
}

function localPath(modelId, filePath) {
  return path.join(modelsRoot, modelId, filePath);
}

async function existingSize(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return null;
  }
}

async function fetchContentLength(url) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`HEAD ${url} failed with ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  return contentLength ? Number(contentLength) : null;
}

async function downloadFile(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, new Uint8Array(arrayBuffer));
  return arrayBuffer.byteLength;
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function ensureFile(modelId, revision, file) {
  const url = modelUrl(modelId, revision, file.path);
  const destination = localPath(modelId, file.path);
  const currentBytes = await existingSize(destination);
  const expectedBytes = file.expectedBytes ?? null;

  if (currentBytes !== null && expectedBytes !== null && currentBytes === expectedBytes) {
    console.log(`skip ${modelId}/${file.path} (${formatMiB(currentBytes)})`);
    return;
  }

  const remoteBytes = await fetchContentLength(url);
  const verifiedBytes = expectedBytes ?? remoteBytes;

  const downloadedBytes = await downloadFile(url, destination);
  const actualBytes = await existingSize(destination);

  console.log(`fetched ${modelId}/${file.path} (${formatMiB(downloadedBytes)})`);

  if (verifiedBytes !== null && actualBytes !== verifiedBytes) {
    console.warn(
      `warn ${modelId}/${file.path}: expected ${verifiedBytes} bytes, found ${actualBytes} bytes`
    );
  }

  if (remoteBytes !== null && actualBytes !== remoteBytes) {
    console.warn(
      `warn ${modelId}/${file.path}: remote content-length was ${remoteBytes} bytes, found ${actualBytes} bytes`
    );
  }
}

async function main() {
  for (const model of manifest) {
    for (const file of model.files) {
      await ensureFile(model.modelId, model.revision, file);
    }
  }
}

await main();
