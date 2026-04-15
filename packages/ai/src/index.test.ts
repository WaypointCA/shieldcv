import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: MessageEvent) => void;
type WorkerRequest = {
  id: number;
  type: 'preload' | 'ner' | 'embed';
  text?: string;
};

class MockWorker {
  static instances: MockWorker[] = [];

  readonly listeners = new Map<string, Listener[]>();
  requests: WorkerRequest[] = [];
  failNext = false;
  holdNext = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: WorkerRequest) {
    this.requests.push(message);

    if (this.holdNext) {
      this.holdNext = false;
      return;
    }

    if (this.failNext) {
      this.failNext = false;
      this.emit({ id: message.id, error: 'worker exploded' });
      return;
    }

    if (message.type === 'preload') {
      this.emit({ type: 'progress', event: { status: 'downloading', model: 'ner', progress: 0.25 } });
      this.emit({ id: message.id });
      return;
    }

    if (message.type === 'embed') {
      this.emit({ id: message.id, result: new Float32Array(384) });
      return;
    }

    const text = message.text ?? '';
    const start = text.indexOf('John Smith');
    this.emit({
      id: message.id,
      result: [
        {
          text: 'John Smith',
          label: 'PERSON',
          start,
          end: start + 'John Smith'.length,
          score: 0.98,
        },
      ],
    });
  }

  emit(data: unknown) {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data } as MessageEvent);
    }
  }

  emitError(message: string) {
    for (const listener of this.listeners.get('error') ?? []) {
      listener({ message } as unknown as MessageEvent);
    }
  }

  emitErrorObject(error: Error) {
    for (const listener of this.listeners.get('error') ?? []) {
      listener({ error, message: error.message } as unknown as MessageEvent);
    }
  }
}

async function loadModule() {
  vi.resetModules();
  return import('./index');
}

describe('@shieldcv/ai public API', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('navigator', { gpu: {} });
    vi.stubGlobal('WebAssembly', {});
    vi.stubGlobal('location', { href: 'file:///Users/cam/Projects/shieldcv/packages/ai/src/index.ts', origin: 'null' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extractEntities returns the expected Entity shape from worker responses', async () => {
    const ai = await loadModule();

    await expect(ai.extractEntities('John Smith works at Anthropic')).resolves.toEqual([
      {
        text: 'John Smith',
        label: 'PERSON',
        start: 0,
        end: 10,
        score: 0.98,
      },
    ]);
  });

  it('embed returns a Float32Array of the expected dimension', async () => {
    const ai = await loadModule();
    const embedding = await ai.embed('local inference');

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding).toHaveLength(384);
  });

  it('cosineSimilarity computes known vector similarities', async () => {
    const ai = await loadModule();

    expect(ai.cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBe(1);
    expect(ai.cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
    expect(ai.cosineSimilarity(new Float32Array([1, 0]), new Float32Array([-1, 0]))).toBe(-1);
  });

  it('preloadModels forwards progress events and marks the package ready', async () => {
    const ai = await loadModule();
    const onProgress = vi.fn();

    expect(ai.isReady()).toBe(false);
    await ai.preloadModels(onProgress);

    expect(onProgress).toHaveBeenCalledWith({ status: 'downloading', model: 'ner', progress: 0.25 });
    expect(ai.isReady()).toBe(true);
  });

  it('getCapabilities returns the browser acceleration shape', async () => {
    const ai = await loadModule();

    expect(ai.getCapabilities()).toEqual({ webgpu: true, wasm: true });
  });

  it('multiplexes concurrent extractEntities calls by message id', async () => {
    const ai = await loadModule();
    const first = ai.extractEntities('John Smith');
    const second = ai.extractEntities('John Smith again');

    await expect(first).resolves.toHaveLength(1);
    await expect(second).resolves.toHaveLength(1);
    expect(MockWorker.instances).toHaveLength(1);
    expect(MockWorker.instances[0]?.requests.map((request) => request.id)).toEqual([1, 2]);
  });

  it('propagates worker errors as rejected promises', async () => {
    const ai = await loadModule();
    await ai.preloadModels();

    const worker = MockWorker.instances[0];
    expect(worker).toBeDefined();
    worker.failNext = true;

    await expect(ai.extractEntities('John Smith')).rejects.toThrow('worker exploded');
  });

  it('rejects pending requests when the worker emits an error event', async () => {
    const ai = await loadModule();
    await ai.preloadModels();

    const worker = MockWorker.instances[0];
    worker.holdNext = true;
    const request = ai.extractEntities('John Smith');

    worker.emitError('worker crashed');

    await expect(request).rejects.toThrow('worker crashed');
  });

  it('uses worker Error objects when error events provide them', async () => {
    const ai = await loadModule();
    await ai.preloadModels();

    const worker = MockWorker.instances[0];
    worker.holdNext = true;
    const request = ai.extractEntities('John Smith');

    worker.emitErrorObject(new Error('typed worker crash'));

    await expect(request).rejects.toThrow('typed worker crash');
  });

});
