<script lang="ts">
  import { onMount } from 'svelte';
  import DOMPurify from 'dompurify';
  import '../app.css';
  import AppShell from '$lib/components/AppShell.svelte';
  import { cspViolations } from '$lib/stores/csp-violations';
  import { theme } from '$lib/stores/theme';

  onMount(() => {
    Object.assign(window, { DOMPurify });
    theme.init();

    const handleViolation = (event: Event) => {
      cspViolations.report(event as SecurityPolicyViolationEvent);
    };

    document.addEventListener('securitypolicyviolation', handleViolation);

    return () => {
      document.removeEventListener('securitypolicyviolation', handleViolation);
    };
  });
</script>

<AppShell>
  <slot />
</AppShell>
