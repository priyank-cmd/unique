# After cloning this repository

This is a **full snapshot** of the NineHertz AI app: **Express** (`server.js`) + **Vite React** (`src/`), orchestration, RAG, admin-style APIs, etc. — the same codebase you run locally.

## Setup

1. Use **Node.js 20+**.
2. `cp .env.example .env` and set keys (`MONGODB_URI`, `ADMIN_AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN` if needed, etc.).
3. Install:
   ```bash
   npm install --legacy-peer-deps
   ```
4. Run API + chat UI:
   ```bash
   npm run dev
   ```
   Or `npm run dev:server` / `npm run dev:frontend` separately.

## Notes

- `uploads/` and `.cache/` are not in the repo; they are created at runtime.
- `pdfs/` may be omitted from the GitHub bundle by default (see `pdfs/README.md` in the repo). Add PDFs locally for RAG, or set `GENERATOR_MIRROR_INCLUDE_PDFS=1` on the generator host to include them.
- `generator.config.json` records **company feature tags** from the admin when this repo was created; the app still exposes the full API surface like the source project.
