# Project Generator Service

Creates a GitHub repository by **pushing files from memory** (no local clone).

## Default: full app mirror (works like this repo)

By default, **`buildGeneratedProjectBundle` / `generateAndPushToGitHub`** mirror the **entire `9hz-ai` workspace** (except `node_modules`, `.git`, `uploads`, `.cache`, `dist`, and **any `.env*` file except `.env.example`** — e.g. `.env`, `.env.local`, `.env.backup`, `.envrc`).

Also skipped: IDE/tooling folders (`.claude`, `.cursor`, `.vscode`, `.idea`, …) so local config doesn’t get published.

- Real **`server.js`** (all API routes: chat, call-agent, SRS/plan, RAG, etc.)
- **`orchestration/`**, **`rag.js`**, **`language.js`**, **`src/`** (Vite + React chat UI), config files, **`package.json`**, etc.
- **`pdfs/`** is **not** copied by default (large PDFs sometimes trigger GitHub **“Secret detected in content”** push protection). The bundle includes **`pdfs/README.md`** explaining how to add PDFs after clone. To include PDFs in the mirror, set on the generator host: `GENERATOR_MIRROR_INCLUDE_PDFS=1`.

The published **`.env.example`** always comes from the generator’s **`safeDotEnvExample.full.txt`** (placeholder values only), not from whatever happened to be on the dev machine’s disk.

After clone: `cp .env.example .env`, `npm install --legacy-peer-deps`, `npm run dev` — same behavior as the source project (add PDFs under `pdfs/` if you use RAG).

### GitHub: “Repository rule violations / Secret detected in content”

GitHub scans every file you upload. If **any** blob matches a known secret pattern (GitHub PAT, Anthropic/OpenAI keys, AWS keys, PEM blocks, etc.), the API rejects the push.

Before calling GitHub, **`generateAndPushToGitHub`** runs a **preflight** (`pushSecretScan.js`) and throws a clear error listing **which path** matched, so you can remove/redact that content on the generator server and retry.

Extra files added to the repo:

- **`generator.config.json`** – records `companyFeatures` selected in admin when the repo was created (metadata only; code is not stripped by feature).
- **`SETUP_AFTER_CLONE.md`** – short run instructions.

## Minimal stub mode (optional)

For a **tiny** demo app (template `src/modules/*` + synthetic `server.js`), set:

```bash
export GENERATOR_MIRROR_MODE=minimal
```

Or pass `{ mode: 'minimal' }` to `generateProject()` / `buildGeneratedProjectBundle()`. Unit tests use this mode.

## Usage

### API (admin-authenticated)

```http
POST /api/generate-project
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "features": ["chat", "srs"],
  "repoName": "my-chat-srs-project",
  "private": false
}
```

Response:

```json
{
  "success": true,
  "message": "Project generation queued.",
  "job": {
    "id": "job-id",
    "status": "queued",
    "repoName": "my-chat-srs-project",
    "features": ["chat", "srs"]
  }
}
```

Status API:

```http
GET /api/generate-project/:jobId/status
Authorization: Bearer <admin-token>
```

Status values:

- `queued`
- `in_progress`
- `success`
- `failed`

### Environment

- **GITHUB_TOKEN** – GitHub personal access token (repo scope). Required for push; if missing, the API returns 503.
- Generated files are kept in memory for the publish flow and are pushed directly with the GitHub API.
- Jobs are persisted in MongoDB in the `project_generation_jobs` collection.

### Programmatic

```js
import { generateProject, generateAndPushToGitHub } from './services/generator/index.js'

// Generate only (writes files locally)
const { path, features } = await generateProject(['chat', 'srs'], '/path/to/output')

// Generate in memory and push directly to new GitHub repo
const { repoUrl, features, outputDir } = await generateAndPushToGitHub(
  ['chat'],
  'chat-only-project',
  process.env.GITHUB_TOKEN
)
```

When pushed with `generateAndPushToGitHub`, `outputDir` is `null` because no generated project folder is kept on disk.

## Company documents & MongoDB (not a separate “model” in this folder)

- **`services/generator`** only contains the **template + file/GitHub generation** logic. It does **not** define a Mongoose model or Mongo schema.
- **`projectGeneration`** is a **nested object on each company document** in the `companies` collection (`server.js`: `POST /api/companies` sets it; `updateCompanyProjectGeneration` updates it when you run “Generate repo”).
- **`GET /api/companies`** always returns a full `projectGeneration` object via `sanitizeCompanyProjectGeneration()`. If a document was created **before** that field existed, MongoDB showed no field while the API still showed `idle` — that was **API-only defaults**.
- On server startup (inside `ensureCompanyIndexes`), a **one-time backfill** runs: companies missing `projectGeneration` get `defaultIdleProjectGeneration()` **written to MongoDB**, so Compass and the API match.

## Minimal template layout (`mode: 'minimal'` only)

- **template/src/core** – Shared config and utils.
- **template/src/modules/{chat,srs,call}** – Stub routes; only selected modules copied.
- **server.js** – Generated entry that `import()`s only selected modules.
- **package.json** – From `packageTemplate.json` (express, cors, dotenv).

Allowed feature keys (for validation / `generator.config.json`): `chat`, `srs`, `call`.
