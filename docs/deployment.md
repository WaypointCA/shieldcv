# Cloudflare Pages Deployment

ShieldCV deploys to Cloudflare Pages using the Cloudflare adapter in `apps/web` and a repository-root build configuration.

## Cloudflare Pages Project Setup

1. Connect the GitHub repository `WaypointCA/shieldcv` to Cloudflare Pages.
2. Choose framework preset: `None (custom build)`.
3. Set the build command to:

```bash
pnpm install && pnpm fetch:models && pnpm --filter web build
```

4. Set the build output directory to:

```text
apps/web/.svelte-kit/cloudflare
```

5. Set the root directory to:

```text
/
```

Use the repository root, not `apps/web`.

6. Set the environment variable:

```text
NODE_VERSION=20
```

7. Use the custom domain:

```text
shieldcv.app
```

## Wrangler Configuration

`apps/web/wrangler.jsonc` should include:

- `nodejs_compat` in `compatibility_flags`
- A current `compatibility_date`
- `pages_build_output_dir` pointing at `.svelte-kit/cloudflare`

This repository is configured that way so local Wrangler-based tooling and Cloudflare Pages builds agree on the output location.

## Model Fetch During Build

The build command includes `pnpm fetch:models`, which downloads approximately 130 MB of AI model files from Hugging Face. This happens at build time on Cloudflare's infrastructure.

The built site serves these models from the same origin, so no external connections are made at runtime.

## Notes

- ShieldCV uses `@sveltejs/adapter-cloudflare`.
- The Cloudflare Worker serves static assets and sets security headers only.
- Resume data is never uploaded to Cloudflare Pages during normal application use.
- `shieldcv.com` can remain a redirect to `shieldcv.app` at the DNS or page-rule layer.
