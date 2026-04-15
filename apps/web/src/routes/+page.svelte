<script lang="ts">
  import PostureBanner from '$lib/components/PostureBanner.svelte';
</script>

<svelte:head>
  <title>ShieldCV</title>
</svelte:head>

<section class="hero-card">
  <p class="section-kicker">Vault</p>
  <h3>Private resume work, designed to stay on your device.</h3>
  <p>
    ShieldCV opens as an installable app shell with offline support, strict browser defenses, and
    a mobile-first layout that keeps sensitive work close at hand.
  </p>
  <a class="shell-button shell-button--primary hero-link" href="/resumes">Open resumes</a>
</section>

<PostureBanner />
