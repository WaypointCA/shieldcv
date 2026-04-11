<script lang="ts">
  import { theme } from '$lib/stores/theme';
</script>

<svelte:head>
  <title>Settings | ShieldCV</title>
</svelte:head>

<section class="content-card settings-card">
  <p class="section-kicker">Preferences</p>
  <h3>Settings</h3>
  <p>The light theme toggle persists on this device. No other preferences are stored in localStorage.</p>

  <button class="shell-button shell-button--primary" type="button" on:click={() => theme.toggle()}>
    {#if $theme === 'dark'}
      Switch to light theme
    {:else}
      Switch to dark theme
    {/if}
  </button>
</section>
