// 소재 문서(Sources) → DB 가져오기.
//
// Experiences 동기화(vault-sync.mjs)와 성격이 다르다:
//   - Sources 폴더의 원본 파일은 **읽기만 하고 절대 수정하지 않는다** (id 주석도 심지 않는다).
//     그래서 어떤 문서의 어떤 대목이 어떤 경험이 됐는지를 볼트 숨김 파일에 기록한다.
//   - 한 번 가져오면 끝이다: 이미 가져온 대목은 다시 만들지 않고, 원본을 고쳐도 반영하지 않는다.
//     새 대목이 생기면 그것만 추가한다. 내용 수정은 Experiences 의 경험 노트에서 한다.
//   - 가져온 경험은 Experiences/ 에 경험 단위 노트로 저장된다 — 이후로는 그 노트가 소스다.
//   - 적재 전에 분류(technologies/roles/keywords/metrics)를 채운다 (classify.mjs). 분류 필드는
//     임베딩 텍스트에 들어가므로 반드시 임베딩보다 먼저 채워야 한다.
// Privacy: 로컬 파일시스템과 로컬 DB/임베딩 서비스만 사용한다. 로그는 개수 등 메타데이터만.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import * as store from './store.mjs'
import { embedExperience } from '../embedding/index.mjs'
import { splitNote, saveExperienceNote, VAULT_DIR } from './obsidian.mjs'
import { classifyMany, CLASSIFY_FIELDS } from './classify.mjs'

// 기본값은 Experiences 와 나란한 형제 폴더. OBSIDIAN_VAULT_DIR 하나만 바꿔도 함께 따라온다.
const VAULT_ROOT = dirname(VAULT_DIR)
export const SOURCES_DIR = process.env.OBSIDIAN_SOURCES_DIR || join(VAULT_ROOT, 'Sources')
const STATE_FILE = process.env.OBSIDIAN_IMPORT_STATE || join(VAULT_ROOT, '.career-memory-import.json')

const normTitle = (t) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ')

async function readState() {
  if (!existsSync(STATE_FILE)) return { version: 1, files: {} }
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    return { version: 1, files: parsed.files ?? {} }
  } catch {
    // 상태 파일이 깨졌으면 빈 상태로 시작한다 — 제목 중복 검사가 중복 적재를 막아 준다.
    return { version: 1, files: {} }
  }
}

async function writeState(state) {
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function readSourceNotes() {
  if (!existsSync(SOURCES_DIR)) return []
  const out = []
  for (const f of (await readdir(SOURCES_DIR)).sort()) {
    if (!f.endsWith('.md')) continue
    out.push({ filename: f, content: await readFile(join(SOURCES_DIR, f), 'utf8') })
  }
  return out
}

// 무엇을 가져올지 계획을 세운다 (DB/파일을 수정하지 않는다).
export async function planImport() {
  const notes = await readSourceNotes()
  const state = await readState()
  const existing = await store.list()
  const byId = new Set(existing.map((e) => e.id))
  const byTitle = new Map(existing.map((e) => [normTitle(e.title), e.id]))

  const creates = []
  const already = []
  const removed = []
  const duplicates = []
  const errors = []
  const notices = []

  if (!notes.length) {
    notices.push(existsSync(SOURCES_DIR)
      ? `${SOURCES_DIR} 에 .md 문서가 없습니다`
      : `소재 폴더가 아직 없습니다 — ${SOURCES_DIR} 를 만들고 문서를 넣으세요`)
  }

  for (const { filename, content } of notes) {
    const { blocks, skipped, fatal } = splitNote(content, filename)
    if (fatal) {
      errors.push({ source: filename, reason: fatal })
      continue
    }
    if (skipped) notices.push(`${filename}: S/P/A/R 섹션이 없는 헤딩 ${skipped}개는 경험으로 보지 않았습니다`)

    const known = state.files[filename]?.blocks ?? {}
    const seenKeys = new Set()

    for (const block of blocks) {
      const { patch, warnings, fatal: blockFatal } = block
      delete patch.id
      delete patch.createdAt
      delete patch.updatedAt
      const title = patch.title
      const source = `${filename} › ${block.blockTitle || title || ''}`

      if (blockFatal) {
        errors.push({ source, reason: blockFatal })
        continue
      }
      if (!title) {
        errors.push({ source, reason: 'title 을 찾을 수 없습니다 (헤딩 제목 필요)' })
        continue
      }

      const key = normTitle(title)
      if (seenKeys.has(key)) {
        errors.push({ source, reason: '같은 문서 안에 제목이 같은 대목이 둘 있습니다 — 제목을 구분해 주세요' })
        continue
      }
      seenKeys.add(key)

      const prevId = known[key]
      if (prevId) {
        // 이미 가져온 대목. DB 에서 지워졌다면 사용자가 의도적으로 지운 것이므로 되살리지 않는다.
        if (byId.has(prevId)) already.push({ source, id: prevId, title })
        else removed.push({ source, id: prevId, title })
        continue
      }
      // 상태 기록이 없어도 같은 제목의 경험이 이미 있으면 가져오지 않는다
      // (파일명이 바뀌거나 문서를 복제했을 때 중복 적재를 막는다).
      const sameTitle = byTitle.get(key)
      if (sameTitle) {
        duplicates.push({ source, id: sameTitle, title })
        continue
      }

      const id = randomUUID()
      creates.push({ filename, key, id, patch, warnings, source, title })
      // 같은 실행 안에서 뒤따르는 문서가 같은 제목을 또 가져오지 않도록 즉시 등록한다
      // (문서를 복제해 두 파일에 같은 대목이 있는 경우).
      byTitle.set(key, id)
    }
  }

  if (removed.length) {
    notices.push(`이미 가져왔다가 DB 에서 지워진 경험 ${removed.length}건은 다시 가져오지 않습니다`)
  }
  if (duplicates.length) {
    notices.push(`제목이 같은 경험이 이미 있어 건너뛴 대목 ${duplicates.length}건`)
  }

  return {
    creates: creates.map((c) => ({ source: c.source, id: c.id, title: c.title, warnings: c.warnings })),
    already: already.map((a) => ({ source: a.source, title: a.title })),
    duplicates,
    removed,
    errors,
    notices,
    _internal: { creates, state },
  }
}

// 계획을 실제로 가져온다. 원본 파일은 건드리지 않는다.
// classify: false 로 주면 분류를 건너뛴다 (Claude Code 없이 쓰거나 빠르게 적재할 때).
export async function applyImport({ classify = true, onProgress } = {}) {
  const plan = await planImport()
  const { creates, state } = plan._internal
  const errors = [...plan.errors]
  const notices = [...plan.notices]
  const now = new Date().toISOString()
  const imported = []
  let classified = 0

  // 분류를 임베딩보다 먼저 — 분류 필드가 임베딩 텍스트에 들어간다.
  if (classify && creates.length) {
    const { results, unavailable } = await classifyMany(
      creates.map((c) => ({ ...c.patch, id: c.id })),
      onProgress,
    )
    results.forEach((r, i) => {
      if (!r.filled.length) return
      for (const f of r.filled) creates[i].patch[f] = r.exp[f]
      classified++
    })
    if (unavailable) notices.push('Claude Code 세션을 쓸 수 없어 분류를 건너뛰었습니다 (설치·로그인 확인)')
    else if (classified < creates.length) notices.push(`분류가 비어 있는 채로 적재된 경험 ${creates.length - classified}건`)
  }

  for (const c of creates) {
    try {
      const exp = { ...c.patch, id: c.id, createdAt: now, updatedAt: now }
      exp.embedding = await embedExperience(exp)
      await store.insert(exp)
      await saveExperienceNote(exp) // 이후로는 이 경험 노트가 소스가 된다
      if (!state.files[c.filename]) state.files[c.filename] = { importedAt: now, blocks: {} }
      state.files[c.filename].blocks[c.key] = c.id
      state.files[c.filename].importedAt = now
      imported.push({
        source: c.source, id: c.id, title: c.title,
        filled: CLASSIFY_FIELDS.filter((f) => {
          const v = c.patch[f]
          return Array.isArray(v) ? v.length : Boolean(v)
        }),
      })
    } catch (err) {
      errors.push({ source: c.source, reason: err.message })
    }
  }

  if (imported.length) await writeState(state)

  return {
    applied: true,
    imported: imported.length,
    classified,
    already: plan.already.length,
    errors,
    notices,
    details: { creates: imported },
  }
}

export async function previewImport() {
  const { _internal, ...rest } = await planImport()
  return { applied: false, sourcesDir: SOURCES_DIR, ...rest }
}
