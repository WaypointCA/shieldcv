import { env, pipeline } from '@huggingface/transformers';
import onnxWasmFactoryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import onnxWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import type { Entity, EntityOptions, ProgressEvent } from './index';

type WorkerRequest =
  | { id: number; type: 'preload' }
  | { id: number; type: 'ner'; text: string; options?: EntityOptions }
  | { id: number; type: 'embed'; text: string };

type RawEntity = {
  entity?: string;
  entity_group?: string;
  word?: string;
  start?: number;
  end?: number;
  score?: number;
};

type ProgressInfo = {
  status?: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type FeatureExtractionResult = {
  data: Float32Array | number[];
};

type PipelineRunner<TInput, TOptions, TResult> = (input: TInput, options?: TOptions) => Promise<TResult>;
type NavigatorWithWebGpu = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<unknown>;
  };
};

const NER_MODEL = 'Xenova/bert-base-NER';
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

const onnxBackend = env.backends.onnx as { wasm?: { wasmPaths?: { wasm: string; mjs: string } } };
onnxBackend.wasm ??= {};
onnxBackend.wasm.wasmPaths = {
  wasm: onnxWasmUrl,
  mjs: onnxWasmFactoryUrl,
};

// Xenova/bert-base-NER is the smallest widely-used quantized NER model here with
// PERSON, LOCATION, ORGANIZATION, and MISC labels at comparable quality.
let nerPipelinePromise:
  | Promise<PipelineRunner<string, { aggregation_strategy: 'simple' }, RawEntity[]>>
  | undefined;
let embeddingPipelinePromise:
  | Promise<PipelineRunner<string, { pooling: 'mean'; normalize: true }, FeatureExtractionResult>>
  | undefined;

function postProgress(event: ProgressEvent): void {
  self.postMessage({ type: 'progress', event });
}

async function getDevice(): Promise<'webgpu' | 'wasm'> {
  const webgpu = (navigator as NavigatorWithWebGpu).gpu;

  if (!webgpu) {
    return 'wasm';
  }

  try {
    return (await webgpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

function normalizeProgress(model: ProgressEvent['model'], info: ProgressInfo): ProgressEvent {
  const progress =
    typeof info.progress === 'number'
      ? info.progress > 1
        ? info.progress / 100
        : info.progress
      : undefined;

  return {
    status: info.status === 'progress' ? 'downloading' : 'loading',
    model,
    progress,
    loaded: info.loaded,
    total: info.total,
  };
}

async function createPipeline<TInput, TOptions, TResult>(
  task: string,
  modelId: string,
  model: ProgressEvent['model']
): Promise<PipelineRunner<TInput, TOptions, TResult>> {
  const progress_callback = (info: ProgressInfo) => postProgress(normalizeProgress(model, info));
  const device = await getDevice();

  try {
    return (await pipeline(task as never, modelId, {
      dtype: 'q8',
      device,
      progress_callback,
    })) as PipelineRunner<TInput, TOptions, TResult>;
  } catch (error) {
    if (device !== 'webgpu') {
      throw error;
    }

    return (await pipeline(task as never, modelId, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback,
    })) as PipelineRunner<TInput, TOptions, TResult>;
  }
}

async function getNerPipeline(): Promise<PipelineRunner<string, { aggregation_strategy: 'simple' }, RawEntity[]>> {
  nerPipelinePromise ??= createPipeline<string, { aggregation_strategy: 'simple' }, RawEntity[]>(
    'token-classification',
    NER_MODEL,
    'ner'
  ).then((runner) => {
    postProgress({ status: 'ready', model: 'ner', progress: 1 });
    return runner;
  });

  return nerPipelinePromise;
}

async function getEmbeddingPipeline(): Promise<
  PipelineRunner<string, { pooling: 'mean'; normalize: true }, FeatureExtractionResult>
> {
  embeddingPipelinePromise ??= createPipeline<
    string,
    { pooling: 'mean'; normalize: true },
    FeatureExtractionResult
  >('feature-extraction', EMBEDDING_MODEL, 'embedding').then((runner) => {
    postProgress({ status: 'ready', model: 'embedding', progress: 1 });
    return runner;
  });

  return embeddingPipelinePromise;
}

function labelName(label: string): string {
  const normalized = label.replace(/^[BI]-/, '');

  if (normalized === 'PER') {
    return 'PERSON';
  }

  if (normalized === 'LOC') {
    return 'LOCATION';
  }

  if (normalized === 'MISC') {
    return 'MISCELLANEOUS';
  }

  return normalized;
}

function entityText(text: string, raw: RawEntity): string {
  if (typeof raw.start === 'number' && typeof raw.end === 'number') {
    return text.slice(raw.start, raw.end);
  }

  return (raw.word ?? '').replaceAll(' ##', '').replaceAll('##', '');
}

function normalizeEntities(text: string, rawEntities: RawEntity[], options: EntityOptions = {}): Entity[] {
  const minScore = options.minScore ?? 0.5;
  const allowedLabels = options.labels ? new Set(options.labels) : undefined;

  return rawEntities
    .map((rawEntity) => {
      const label = labelName(rawEntity.entity_group ?? rawEntity.entity ?? '');

      return {
        text: entityText(text, rawEntity),
        label,
        start: rawEntity.start ?? 0,
        end: rawEntity.end ?? 0,
        score: rawEntity.score ?? 0,
      };
    })
    .filter((entity) => entity.score >= minScore && (!allowedLabels || allowedLabels.has(entity.label)));
}

async function extractEntities(text: string, options?: EntityOptions): Promise<Entity[]> {
  const runner = await getNerPipeline();
  const rawEntities = await runner(text, { aggregation_strategy: 'simple' });
  return normalizeEntities(text, rawEntities, options);
}

async function embed(text: string): Promise<Float32Array> {
  const runner = await getEmbeddingPipeline();
  const result = await runner(text, { pooling: 'mean', normalize: true });
  return result.data instanceof Float32Array ? result.data : new Float32Array(result.data);
}

async function handleRequest(message: WorkerRequest): Promise<void> {
  try {
    if (message.type === 'preload') {
      await Promise.all([getNerPipeline(), getEmbeddingPipeline()]);
      self.postMessage({ id: message.id });
      return;
    }

    if (message.type === 'ner') {
      self.postMessage({ id: message.id, result: await extractEntities(message.text, message.options) });
      return;
    }

    self.postMessage({ id: message.id, result: await embed(message.text) });
  } catch (error) {
    const model = message.type === 'embed' ? 'embedding' : 'ner';
    const errorMessage = error instanceof Error ? error.message : 'AI worker request failed.';
    postProgress({ status: 'error', model, error: errorMessage });
    self.postMessage({ id: message.id, error: errorMessage });
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data);
});
