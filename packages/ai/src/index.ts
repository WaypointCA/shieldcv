export interface Entity {
  text: string;
  label: string;
  start: number;
  end: number;
  score: number;
}

export interface EntityOptions {
  minScore?: number;
  labels?: string[];
}

export interface ProgressEvent {
  status: 'downloading' | 'loading' | 'ready' | 'error';
  model: 'ner' | 'embedding';
  progress?: number;
  loaded?: number;
  total?: number;
  error?: string;
}

type WorkerRequest =
  | { type: 'preload' }
  | { type: 'ner'; text: string; options?: EntityOptions }
  | { type: 'embed'; text: string };

type WorkerProgressMessage = {
  type: 'progress';
  event: ProgressEvent;
};

type WorkerResponseMessage<T = unknown> = {
  id: number;
  result?: T;
  error?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

let sharedWorker: Worker | null = null;
let nextMessageId = 1;
let modelsReady = false;
let progressCallback: ((event: ProgressEvent) => void) | undefined;
const pendingRequests = new Map<number, PendingRequest>();

function createWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

function isProgressMessage(message: WorkerProgressMessage | WorkerResponseMessage): message is WorkerProgressMessage {
  return 'type' in message && message.type === 'progress';
}

function getWorker(): Worker {
  if (sharedWorker) {
    return sharedWorker;
  }

  sharedWorker = createWorker();
  sharedWorker.addEventListener('message', (event: MessageEvent<WorkerProgressMessage | WorkerResponseMessage>) => {
    const message = event.data;

    if (isProgressMessage(message)) {
      progressCallback?.(message.event);
      return;
    }

    const pending = pendingRequests.get(message.id)!;
    pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error));
      return;
    }

    pending.resolve(message.result);
  });

  sharedWorker.addEventListener('error', (event: ErrorEvent) => {
    for (const pending of pendingRequests.values()) {
      pending.reject(event.error instanceof Error ? event.error : new Error(event.message));
    }

    pendingRequests.clear();
  });

  return sharedWorker;
}

function request<T>(requestMessage: WorkerRequest): Promise<T> {
  const id = nextMessageId;
  nextMessageId += 1;

  const response = new Promise<T>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
  });

  getWorker().postMessage({ ...requestMessage, id });

  return response;
}

export async function extractEntities(text: string, options?: EntityOptions): Promise<Entity[]> {
  return request<Entity[]>({ type: 'ner', text, options });
}

export async function embed(text: string): Promise<Float32Array> {
  return request<Float32Array>({ type: 'embed', text });
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index];
    const bValue = b[index];
    dot += aValue * bValue;
    magnitudeA += aValue * aValue;
    magnitudeB += bValue * bValue;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

export async function preloadModels(onProgress?: (event: ProgressEvent) => void): Promise<void> {
  progressCallback = onProgress;
  await request<void>({ type: 'preload' });
  modelsReady = true;
}

export function isReady(): boolean {
  return modelsReady;
}

export function getCapabilities(): { webgpu: boolean; wasm: boolean } {
  return {
    webgpu: 'gpu' in navigator,
    wasm: 'WebAssembly' in globalThis,
  };
}
