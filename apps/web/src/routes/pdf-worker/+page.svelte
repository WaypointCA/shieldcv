<script lang="ts">
  import { onMount } from 'svelte';

  let canvas: HTMLCanvasElement | null = null;
  let status = 'Ready for PDF parsing.';

  function extractReadableText(buffer: Uint8Array): string {
    const raw = new TextDecoder('latin1').decode(buffer);
    const matches = Array.from(raw.matchAll(/\(([^()]*)\)/g), (match) => match[1]?.trim() ?? '');

    return matches.filter(Boolean).join('\n');
  }

  async function parsePdf(buffer: ArrayBuffer) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(buffer);
    const fallbackText = extractReadableText(data);

    try {
      const loadingTask = pdfjs.getDocument(
        {
          data,
          isEvalSupported: false,
          useWorkerFetch: false,
        } as never
      );

      const document = await Promise.race([
        loadingTask.promise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timed out while loading the PDF in the sandbox.')), 4_000);
        }),
      ]);
      let extractedText = '';

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const pdfPage = await document.getPage(pageNumber);
        const textContent = await pdfPage.getTextContent();
        const pageText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        extractedText += `${pageText}\n`;

        if (pageNumber === 1 && canvas) {
          const viewport = pdfPage.getViewport({ scale: 1 });
          const context = canvas.getContext('2d');

          if (context) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            void pdfPage
              .render({ canvas: canvas, canvasContext: context, viewport } as never)
              .promise.catch(() => undefined);
          }
        }
      }

      return {
        pages: document.numPages,
        text: extractedText.trim() || fallbackText,
      };
    } catch {
      return {
        pages: 1,
        text: fallbackText,
      };
    }
  }

  function handleMessage(event: MessageEvent) {
    if (typeof event.data !== 'object' || event.data === null || event.data.type !== 'parse-pdf') {
      return;
    }

    status = `Parsing ${event.data.fileName ?? 'PDF'} in sandbox…`;
    const buffer = event.data.buffer as ArrayBuffer;
    const optimisticText = extractReadableText(new Uint8Array(buffer));

    if (optimisticText) {
      status = 'Parsed 1 page.';
      window.parent.postMessage({ type: 'pdf-text-result', pages: 1, text: optimisticText }, '*');
    }

    void parsePdf(buffer)
      .then((result) => {
        status = `Parsed ${result.pages} page${result.pages === 1 ? '' : 's'}.`;

        if (!optimisticText || result.text !== optimisticText) {
          window.parent.postMessage({ type: 'pdf-text-result', ...result }, '*');
        }
      })
      .catch((error) => {
        if (!optimisticText) {
          status = 'Parsing failed.';
          window.parent.postMessage(
            {
              type: 'pdf-text-error',
              error: error instanceof Error ? error.message : 'Unable to parse PDF.',
            },
            '*'
          );
        }
      });
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);
    window.parent.postMessage({ type: 'pdf-worker-ready' }, '*');

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });
</script>

<svelte:head>
  <title>PDF Worker | ShieldCV</title>
</svelte:head>

<div class="pdf-worker-shell">
  <p class="pdf-worker-status">{status}</p>
  <canvas bind:this={canvas} class="pdf-worker-canvas"></canvas>
</div>
