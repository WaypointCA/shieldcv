<script lang="ts">
  import { onMount } from 'svelte';
  import type { Entity, ProgressEvent } from '@shieldcv/ai';

  type AiModule = typeof import('@shieldcv/ai');

  let ai: AiModule | null = null;
  let entities: Entity[] = [];
  let text = 'John Smith works at Anthropic in San Francisco';
  let loading = true;
  let extracting = false;
  let ready = false;
  let error = '';
  let progress = 0;
  let loaded = 0;
  let total = 0;

  function formatMegabytes(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function handleProgress(event: ProgressEvent) {
    if (typeof event.progress === 'number') {
      progress = Math.max(progress, event.progress);
    }

    if (typeof event.loaded === 'number') {
      loaded = event.loaded;
    }

    if (typeof event.total === 'number') {
      total = event.total;
    }

    if (event.status === 'error') {
      error = event.error ?? 'AI model loading failed.';
    }
  }

  async function extract() {
    if (!ai || !ready || !text.trim()) {
      return;
    }

    extracting = true;
    error = '';

    try {
      entities = await ai.extractEntities(text, { minScore: 0.5 });
    } catch (extractError) {
      error = extractError instanceof Error ? extractError.message : 'Unable to extract entities.';
    } finally {
      extracting = false;
    }
  }

  onMount(async () => {
    try {
      ai = await import('@shieldcv/ai');

      if (!ai.isReady()) {
        await ai.preloadModels(handleProgress);
      }

      ready = true;
      progress = 1;
    } catch (loadError) {
      error = loadError instanceof Error ? loadError.message : 'Unable to load the local AI package.';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Scan | ShieldCV</title>
</svelte:head>

<section class="content-card scan-panel">
  <div class="section-header">
    <div>
      <p class="section-kicker">Local AI</p>
      <h3>Extract entities on this device</h3>
    </div>

    {#if ready}
      <span class="scan-status" data-testid="models-ready">Models ready</span>
    {/if}
  </div>

  {#if loading}
    <div class="scan-progress" data-testid="ai-loading">
      <div class="scan-progress__copy">
        <span>Loading AI models{total ? ` (${formatMegabytes(total)})` : ''}...</span>
        {#if loaded && total}
          <span>{formatMegabytes(loaded)} of {formatMegabytes(total)}</span>
        {/if}
      </div>
      <progress aria-label="AI model loading progress" max="1" value={progress}></progress>
    </div>
  {:else}
    <label class="field">
      <span>Text to scan</span>
      <textarea
        class="field-input field-textarea scan-textarea"
        data-testid="scan-text"
        bind:value={text}
        disabled={!ready}
      ></textarea>
    </label>

    <div class="header-actions">
      <button
        class="shell-button shell-button--primary"
        data-testid="extract-entities"
        type="button"
        disabled={!ready || extracting || !text.trim()}
        on:click={extract}
      >
        {extracting ? 'Extracting...' : 'Extract entities'}
      </button>
    </div>
  {/if}

  {#if error}
    <p class="field-error" data-testid="scan-error">{error}</p>
  {/if}
</section>

{#if ready && entities.length > 0}
  <section class="content-card scan-results" data-testid="entities-table">
    <div class="section-header">
      <div>
        <p class="section-kicker">Entities</p>
        <h3>Detected spans</h3>
      </div>
    </div>

    <div class="scan-table-wrap">
      <table class="scan-table">
        <thead>
          <tr>
            <th>Text</th>
            <th>Label</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {#each entities as entity}
            <tr>
              <td>{entity.text}</td>
              <td data-testid="entity-label">{entity.label}</td>
              <td>{entity.score.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{:else if ready && !loading}
  <section class="content-card scan-results-empty">
    <p>No entities extracted yet.</p>
  </section>
{/if}
