<script lang="ts">
  // @ts-ignore mdsvex resolves this aliased markdown file at build time.
  import SecurityDoc from '$docs/security.md';
</script>

<svelte:head>
  <title>ShieldCV Security</title>
</svelte:head>

<article class="content-card prose-card">
  <SecurityDoc />
</article>
