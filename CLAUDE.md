# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Career Memory: a personal system for storing career/project experiences and retrieving them via natural-language semantic search (e.g. "경험 중 문제를 해결한 사례" → top-5 matching experiences with similarity scores).

This repo is a **harness for a coding agent** — `PROJECT.md`, `ARCHITECTURE.md`, `AGENTS.md`, and `eval/` define the requirements and pass/fail bar; read those before making product/scope decisions:

- `PROJECT.md` — product goal, MVP scope, non-goals, screens
- `ARCHITECTURE.md` — **recommended** stack and Privacy First constraints (see override below)
- `AGENTS.md` — agent work loop (Inspect → Plan → Implement → Test → Evaluate → Fix) and completion bar (Build + Test + Evaluation + Privacy Check, all required — code merely being written is not "done")
- `DECISIONS.md` — **actual stack actually running in this environment**. Originally a temporary downgrade (no Python, no Postgres, ~3GB disk), but as of 2026-08-13 those constraints were gone on re-check, so the repo was permanently upgraded to ARCHITECTURE.md's recommended stack (BGE-M3 + pgvector). This is not an experiment pending rollback. The Privacy First rules themselves were never overridden — they remain in full force throughout.
- `docs/experience-schema.md`, `docs/search-spec.md` — Experience data shape and the exact embedding-text format (note: `id` is TEXT, not UUID — see DECISIONS.md)
- `eval/acceptance.md` — MVP Definition of Done checklist

**Read `DECISIONS.md` before touching embedding/storage code** — it records the BGE-M3/pgvector migration, the `id TEXT` schema deviation, the `"query: "` prefix fix for a retrieval-quality regression, and the Obsidian markdown export.

## Preview execution (required)

The preview serves only from `0.0.0.0:5173` under base path `/preview/277-27izmp-1786582832295`. Always start the dev server with:

    tc-dev

- **`tc-dev` 는 프리뷰 환경에만 있다.** 로컬 개발 머신(예: 이 맥)에서는 명령이 없으므로 `npm run dev`(:5173)를 쓴다 — SETUP.md 참고.
- Do not run `npm run dev` / `next dev` / `vite` directly on another port (e.g. 3000) or on `localhost` — the preview gateway will break with "Bad Gateway / ECONNRESET". Port is fixed at **5173**.
- Vite is already set up correctly in this repo (`vite.config.js` sets `server: { host: '0.0.0.0', allowedHosts: true }` and computes `base` from `WORKSPACE_ID`). Don't remove these when editing the config.
- Backend runs separately on `:8787` (`npm run backend`); Vite proxies `/api` (and `/preview/<wsid>/api`) to it — see `vite.config.js`.

## Commands

```bash
./embedding-py/.venv/Scripts/python.exe embedding-py/service.py   # local BGE-M3 embedding service, :8788 (start before backend)
npm run dev              # vite dev server (normally launched via tc-dev, not directly)
npm run backend          # node backend/server.mjs — API on :8787
npm run build            # vite build (frontend)
npm run eval:retrieval   # node eval/run-retrieval.mjs — semantic search quality eval
npm run sync:vault       # node scripts/sync-vault.mjs — Obsidian 볼트(Experiences) → DB 동기화 (기본 dry-run; --apply, --apply --with-delete, --export)
npm run import:sources   # node scripts/import-sources.mjs — 소재 문서(Sources) → DB 1회 가져오기 (기본 dry-run; --apply)
npm run privacy          # bash scripts/privacy-check.sh — greps for forbidden AI SDKs

bash scripts/test.sh     # backend/embedding syntax check (node --check) + frontend build
bash scripts/eval.sh     # privacy-check → test.sh → retrieval eval, in order (this is the full gate)
```

There is no unit test framework wired up; `test.sh` is a syntax-check + build smoke test. `eval:retrieval` is the real correctness signal for search — run it after any change to embedding, the embedding-text format, or ranking logic, and treat a drop in pass rate as a regression (see AGENTS.md's Retrieval rule).

## Architecture

```
src/ (React + react-router, Vite root app)
  pages/{ExperienceList,ExperienceForm,ExperienceDetail,Search,Chat}.jsx  — routes: /experiences, /experiences/new, /experiences/:id, /search, /chat
  components/ExperienceFields.jsx — shared S/P/A/R field set + toApi/fromApi mappers, used by both ExperienceForm and Chat's draft editor
  api.js                          — fetch wrapper; base URL derived from import.meta.env.BASE_URL so it works under /preview/<wsid>/
        ↓ HTTP /api/*
backend/server.mjs (Express, :8787)  — REST for experiences CRUD + /api/search + /api/chat
backend/store.mjs                    — PostgreSQL + pgvector (`career_memory` DB, `experience` table, HNSW cosine index)
backend/obsidian.mjs                 — markdown export to stack-e8e-vault/Experiences/ + 역방향 파싱(splitNote/readNotes/injectNoteIds)
backend/vault-sync.mjs               — Experiences(.md) → DB 동기화: planSync/applySync/exportMissingNotes (POST /api/vault/sync, /api/vault/export)
backend/sources.mjs                  — Sources(원본 소재 문서) → DB 1회 가져오기: planImport/applyImport (POST /api/vault/import)
backend/chat.mjs                     — conversational experience intake via @anthropic-ai/claude-agent-sdk (see Privacy First exception below)
embedding/index.mjs                  — Node HTTP client for the local embedding service (EMBED_SERVICE_URL, default http://127.0.0.1:8788)
embedding-py/service.py              — standalone Python service (Flask + sentence-transformers), BAAI/bge-m3, loopback-only
```

Runtime prerequisites (see DECISIONS.md "로컬 실행에 필요한 것"): the `postgresql-x64-17` Windows service must be running, and `embedding-py/.venv/Scripts/python.exe embedding-py/service.py` must be running before `npm run backend`.

Key facts that span files:

- **Embedding text format is a contract.** `embedding/index.mjs`'s `buildEmbeddingText()` must match `docs/search-spec.md` exactly (labeled sections: Title/Situation/Problem/Action/Result/Technologies/Roles/Keywords, array fields comma-joined). Both experience storage (`embedExperience`) and query embedding (`embed(text, 'query')`) go through this module.
- **Query embedding gets a `"query: "` prefix; passage embedding does not.** This asymmetric prefix is not cosmetic — removing it caused a real retrieval-eval regression (10/10 → 8/10) documented in DECISIONS.md. Don't drop it without re-running `npm run eval:retrieval`.
- **Embedding is recomputed on every update, not just create** — `PUT /api/experiences/:id` in `server.mjs` re-embeds the merged record. Keep this invariant when touching that route.
- **`embedding` is stripped from all list/get/create/update API responses** via `store.strip()` — never let a route return the raw record with the vector attached (size + Privacy First: don't let embeddings leak to logs/clients beyond what's needed).
- **`id` is TEXT, not UUID** — deviates from the SQL in `docs/experience-schema.md` on purpose, because the eval/seed corpus uses stable string ids (`exp-001`, ...). See DECISIONS.md.
- **Model/dimension are swap points, not hardcoded assumptions.** `MODEL_NAME`/`EMBED_DIM` live only in `embedding/index.mjs`; `server.mjs` reads them for `/api/health` rather than hardcoding.
- **Retrieval eval corpus and seed data are the same file** (`eval/seed-experiences.json`) — `eval/retrieval-cases.json` references experiences by id only (`expectedTop3` / `expectedAny`), per the "single source of truth" decision recorded in `docs/search-spec.md`.
- **Obsidian export is additive, not a replacement store.** `saveExperienceNote`/`deleteExperienceNote` in `backend/obsidian.mjs` mirror create/update/delete but PostgreSQL remains the only source of truth for CRUD/search.
- **볼트 → DB 동기화에서 한 파일은 경험 여러 개를 담을 수 있다.** `splitNote`(obsidian.mjs)가 헤딩 기준으로 자동 분할한다 — 경계 레벨은 S/P/A/R 섹션 헤딩 레벨의 최빈값에서 유도(섹션이 h3이면 경계는 h2), 경계 레벨 헤딩 하나가 경험 하나, S/P/A/R 없는 덩어리는 건너뜀. 분할된 경험의 id 는 블록 안 `<!-- career-memory-id: ... -->` 주석에 심고(frontmatter 는 문서당 하나뿐), 첫 블록만 frontmatter id 를 승계한다. 한 블록 안에서 같은 섹션이 3번 이상 반복되면 여전히 거부한다(뭉치면 임베딩이 망가진다). 헤딩으로 섹션을 못 찾으면 볼드 라벨(`**S** — ...`)로 2차 파싱한다.
- **볼트 동기화에서 노트가 이긴다.** `backend/vault-sync.mjs`. 노트에 없는 필드는 건드리지 않고(patch 의미), 갱신 시 재임베딩한다. **삭제는 3중 안전장치** — 볼트 `.md` 0개면 건너뜀 / 읽지 못한 노트가 있으면 건너뜀 / `confirmDelete` 없으면 건너뜀. 노트 없는 기존 경험을 지우지 않고 꺼내는 출구가 `exportMissingNotes()`다. 정책 근거는 DECISIONS.md 2026-09-01 항목.
- **볼트에 폴더가 둘 있고 역할이 다르다.** `Experiences/` 는 경험 단위 노트 = 동기화 소스(양방향, id 주석을 심는다). `Sources/` 는 원본 소재 문서 = **읽기 전용, 절대 수정하지 않는다**(`backend/sources.mjs`). Sources 는 1회 가져오기(import)만 하며 — 원본을 고쳐도 반영하지 않고 새 대목만 추가 — 가져온 경험은 `Experiences/` 노트로 저장되어 그때부터 그 노트가 소스다. 원본을 수정하지 않으므로 대목↔경험 매핑은 `stack-e8e-vault/.career-memory-import.json` 에 기록한다. `readNotes()` 가 Experiences 최상위만 스캔하므로 두 폴더가 겹치지 않는다 — 이 경계를 깨면 이중 소스가 생긴다.
- **`buildMarkdown` 과 `splitNote` 는 서로의 역함수다** (둘 다 `backend/obsidian.mjs`). 내보낸 노트를 다시 읽으면 "변경 없음"이 나와야 한다 — 마크다운 포맷을 바꿀 때 이 라운드트립을 깨지 말고, `npm run sync:vault` dry-run 으로 확인할 것.

## Privacy First (non-negotiable, overrides convenience)

No experience text, company/project names, search queries, or embedding vectors may be sent to an external service. No OpenAI/Anthropic/Gemini/Cohere/Voyage or other external AI/embedding API calls anywhere in `backend/`, `frontend/`, `embedding/`, `embedding-py/`, `src/`. The Python embedding service (`embedding-py/service.py`) must stay bound to 127.0.0.1 only. `scripts/privacy-check.sh` greps for these and is part of the required gate (`scripts/eval.sh`) — don't relax or bypass it. Logging must stay metadata-only (ids, counts, timing — see the comments at the top of `server.mjs`), never raw experience text, full queries, or full vectors.

**One narrow exception: `backend/chat.mjs` only (conversational intake, added 2026-08-14; classification, added 2026-09-01).** `POST /api/chat` uses `@anthropic-ai/claude-agent-sdk` (the user's own local Claude Code session, no stored API key) to turn free-form dictation into a draft S/P/A/R record — this is the only place in the repo allowed to reference Anthropic/Claude, and `scripts/privacy-check.sh` allowlists exactly `./backend/chat.mjs` (see `ALLOWED=` regex), not a directory or filename pattern. Don't widen that allowlist or add a second exception file without updating the check deliberately. Conditions this file must keep satisfying (ARCHITECTURE.md §2, full rationale in DECISIONS.md's 2026-08-14 entry):
- only the user's own logged-in CLI session is reused — never a stored/passed API key
- only the current chat message/context is sent — never other Experiences, search queries, or embeddings (`chat.mjs` does not import `embedding/` or `store.mjs`)
- `tools: []` + `allowedTools: ['mcp__career__save_experience']` + `settingSources: []` — the agent is scoped to exactly one tool and can't read local CLAUDE.md/settings
- the feature is optional: `isUnavailable()` catches CLI-not-installed/not-logged-in and the route degrades to a 503 without breaking anything else
- the `save_experience` tool call returns a draft only — nothing is persisted until the user reviews/edits it and hits save, which goes through the normal `POST /api/experiences` (and its embedding/Obsidian side effects) like any other create
- **세 번째 진입점: `classifyExperience()`** (분류 채우기). 경험 하나의 title/S/P/A/R 만 보내고 technologies/roles/keywords/metrics(+명시된 company/project/period)를 받는다 — S/P/A/R 원문과 title 은 절대 덮지 않고, 비어 있는 필드만 채운다. 도구는 이 호출에서도 하나(`classify_experience`)만 노출한다. 오케스트레이션은 `backend/classify.mjs`(SDK 를 import 하지 않음 — allowlist 확대 없음), 가져오기 파이프라인에서 **임베딩보다 먼저** 호출한다(분류 필드가 임베딩 텍스트에 들어가므로). ARCHITECTURE.md §2 조건 2 의 2026-09-01 확장 참고.
