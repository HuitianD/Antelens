# Verified dependency baseline

Checked official documentation and package metadata on 2026-10-17. Node 24.22.0 is the selected LTS; pnpm 10.34.7 is pinned. Next 16.4.2 requires Node >=20.9; WXT 0.21.4 and Supabase JS 2.118.0 require Node >=22. TypeScript 5.9.3 is pinned for SDK compatibility. Exact dependency versions are in manifests and pnpm-lock.yaml.

- [Node releases](https://nodejs.org/en/about/previous-releases)
- [Next installation](https://nextjs.org/docs/app/getting-started/installation)
- [pnpm installation](https://pnpm.io/installation)
- [Fastify support](https://fastify.dev/docs/latest/Reference/LTS/)
- [Tailwind Next integration](https://tailwindcss.com/docs/installation/framework-guides/nextjs)

Factory SDK 0.9.1 speaks protocol 1.201.1 and is pinned with Droid CLI 0.212.1. CLI 0.244.0 does not accept the SDK's MCP OAuth opt-out, so investigation tools cannot start. The SDK uses Zod 3 for its tool boundary. Application contracts use Zod 4; the runtime adapter validates each boundary without duplicating public domain types. CLI availability, model access, Daytona egress, and account entitlement require live checks; package installation does not verify them.

The embedded reference fonts are unmodified URW Gothic (UI alias Avant) and P052 (UI alias Palladio), distributed by Artifex under AGPL v3 with the accompanying font exception. The original font binaries, LICENSE, and COPYING are retained in apps/web/public/fonts. Source: https://github.com/ArtifexSoftware/urw-base35-fonts. The user-provided HTML is preserved at design/reference/beforeyou.html; the redundant root copy is local-only.
