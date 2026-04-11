<script lang="ts">
  let { heading, copy } = $props<{ heading: string; copy: string }>();
</script>

<section class="content-card stub-card">
  <p class="section-kicker">Coming next</p>
  <h3>{heading}</h3>
  <p>{copy}</p>
</section>
