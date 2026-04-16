# @shieldcv/ai

`@shieldcv/ai` runs Named Entity Recognition and text embeddings entirely in
the browser through Transformers.js. The package is intentionally local-first:
inference runs in a Web Worker, model execution stays on-device, and the web app
does not call an inference API.

## Model Fetching

The quantized model files are served same-origin from:

```text
apps/web/static/models/
```

They are not committed to the repository. Instead, build-time setup downloads
the pinned model artifacts into that directory via:

```text
scripts/fetch-models.mjs
```

This keeps the repo under GitHub's file-size limits while preserving ShieldCV's
zero runtime external connections promise. The fetch happens at build or local
setup time, not while `/scan` is running in the browser.

The current models are:

- `Xenova/bert-base-NER`
- `Xenova/all-MiniLM-L6-v2`

Transformers.js is configured in `src/worker.ts` with:

```ts
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
```

## Updating Models

To update model versions, edit the pinned Hugging Face SHAs in:

```text
scripts/fetch-models.mjs
```

The script downloads newer quantized variants into the same Transformers.js
directory shape, including tokenizer/config files and `onnx/model_quantized.onnx`.

## First-Time Setup

After cloning:

```bash
pnpm install
pnpm fetch:models
pnpm --filter web dev
```

The model download is roughly 130 MB and only needs to happen once unless the
local `apps/web/static/models/` directory is removed.

## PWA Caching

The model files are excluded from PWA precache. They are intentionally loaded
on demand the first time `/scan` needs them, then cached by the browser's normal
HTTP cache.

## Cloudflare Pages

Cloudflare Pages needs the fetch step in its build command, for example:

```bash
pnpm install && pnpm fetch:models && pnpm --filter web build
```

## Git Storage

ShieldCV does not use Git LFS for these artifacts because Cloudflare Pages free
tier does not support LFS in build environments.
