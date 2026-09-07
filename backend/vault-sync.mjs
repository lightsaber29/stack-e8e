// 볼트 → DB 역방향 동기화. Obsidian 볼트에 넣어둔 .md 를 읽어 PostgreSQL 에 적재한다.
// 정책(사용자 결정):
//   - md 가 이긴다: 노트에 있는 필드가 DB 와 다르면 노트 기준으로 갱신하고 재임베딩한다.
//   - 삭제도 반영한다: DB 에 있으나 볼트에 노트가 없는 경험은 삭제한다.
//     단 삭제만 3중 안전장치를 둔다 — (1) 볼트에 .md 가 0개면 건너뛴다, (2) 읽지 못한 노트가
//     하나라도 있으면 건너뛴다, (3) applySync 는 confirmDelete 를 받았을 때만 지운다.
//     노트 없는 기존 경험을 지우지 않고 볼트로 꺼내려면 exportMissingNotes() 를 쓴다.
//   - 노트에 없는 필드는 건드리지 않는다(patch 의미) — 손으로 쓴 최소 노트가 기존 값을 지우지 않도록.
// Privacy: 로컬 파일시스템과 로컬 DB/임베딩 서비스만 사용한다. 로그는 개수/id 등 메타데이터만.
import { randomUUID } from 'node:crypto'
import * as store from './store.mjs'
import { embedExperience } from '../embedding/index.mjs'
import { splitNote, readNotes, injectNoteIds, deleteExperienceNote, saveExperienceNote } from './obsidian.mjs'

// 비교/반영 대상 (createdAt/updatedAt/id 는 내용이 아니므로 제외)
const CONTENT_FIELDS = [
  'company', 'project', 'period', 'title',
  'situation', 'problem', 'action', 'result',
  'technologies', 'roles', 'keywords', 'metrics', 'rawMemo',
]

function norm(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map((s) => String(s).trim()).join(', ')
  return (v ?? '').toString().trim()
}

// 노트에 존재하는 필드만 비교한다.
function changedFields(existing, patch) {
  return CONTENT_FIELDS.filter((f) => f in patch && norm(existing[f]) !== norm(patch[f]))
}

// 볼트를 읽어 무엇이 바뀔지 계획을 세운다 (DB 를 수정하지 않는다).
export async function planSync() {
  const notes = await readNotes()
  const existing = await store.list()
  const byId = new Map(existing.map((e) => [e.id, e]))

  const creates = []
  const updates = []
  const unchanged = []
  const errors = []
  const notices = []
  const seenIds = new Set()

  for (const { filename, content } of notes) {
    // 한 파일에 경험이 여러 개일 수 있다 (헤딩 기준 자동 분할 — obsidian.mjs splitNote).
    const { blocks, skipped, fatal: noteFatal } = splitNote(content, filename)
    if (noteFatal) {
      errors.push({ source: filename, reason: noteFatal })
      continue
    }
    if (skipped) {
      const label = blocks.length > 1 ? `${filename} (경험 ${blocks.length}개)` : filename
      notices.push(`${label}: S/P/A/R 섹션이 없는 헤딩 ${skipped}개는 경험으로 보지 않았습니다`)
    }

    for (const block of blocks) {
      const { patch, warnings, fatal, id, headLine, blockTitle } = block
      delete patch.id
      delete patch.createdAt
      delete patch.updatedAt
      const source = blockTitle ? `${filename} › ${blockTitle}` : filename

      if (id && seenIds.has(id)) {
        errors.push({
          source,
          reason: `같은 경험(id ${id})이 볼트에 두 번 있습니다 — 한쪽을 지우거나 id 를 지우세요`,
        })
        continue
      }
      // 파싱에 실패해도 id 는 '볼트에 있는 것'으로 세어, 실패가 삭제로 이어지지 않게 한다.
      if (id) seenIds.add(id)

      if (fatal) {
        errors.push({ source, reason: fatal })
        continue
      }
      if (!patch.title) {
        errors.push({ source, reason: 'title 을 찾을 수 없습니다 (frontmatter title 또는 헤딩 제목 필요)' })
        continue
      }

      const prev = id ? byId.get(id) : null
      if (!prev) {
        // id 가 있지만 DB 에 없으면 그 id 를 그대로 살려 insert 한다 (노트가 원본이므로).
        creates.push({
          source, filename, headLine, patch, warnings,
          id: id || randomUUID(),
          needsId: !id, // id 가 있으면 파일에 이미 적혀 있다는 뜻 — 다시 심지 않는다
        })
        continue
      }
      const fields = changedFields(prev, patch)
      if (fields.length) updates.push({ source, id, patch, fields, warnings })
      else unchanged.push({ source, id, warnings })
    }
  }

  const vaultIds = new Set([...seenIds, ...creates.map((c) => c.id)])
  const orphans = existing.filter((e) => !vaultIds.has(e.id))
  // 삭제 안전장치 두 개:
  //   1) 볼트에 노트가 하나도 없으면(경로 오타/볼트 미설정) 전건 삭제가 되므로 막는다.
  //   2) 읽지 못한 노트가 있으면 그 노트의 경험까지 '볼트에 없음'으로 오판할 수 있으므로 막는다.
  let deletes = orphans
  if (notes.length === 0) {
    deletes = []
    notices.push('볼트에 .md 노트가 없습니다 — 삭제를 건너뜁니다')
  } else if (errors.length) {
    deletes = []
    notices.push(`읽지 못한 노트가 ${errors.length}건 있어 삭제를 건너뜁니다 (먼저 오류를 해결하세요)`)
  } else if (orphans.length) {
    notices.push(`볼트에 노트가 없는 DB 경험 ${orphans.length}건입니다 — 지우지 않으려면 먼저 "볼트로 내보내기"를 하세요`)
  }

  return {
    creates: creates.map((c) => ({ source: c.source, id: c.id, title: c.patch.title, warnings: c.warnings })),
    updates: updates.map((u) => ({ source: u.source, id: u.id, title: u.patch.title, fields: u.fields, warnings: u.warnings })),
    deletes: deletes.map((d) => ({ id: d.id, title: d.title })),
    unchanged: unchanged.map((u) => ({ source: u.source, id: u.id, warnings: u.warnings })),
    errors,
    notices,
    _internal: { creates, updates, deletes, orphans },
  }
}

// 계획을 실제로 적용한다. 노트 단위로 실패해도 나머지는 계속 진행하고 errors 에 모은다.
// 삭제는 confirmDelete 를 명시할 때만 수행한다 — 미리보기에서 삭제 목록을 확인한 뒤 동의하는 절차.
export async function applySync({ confirmDelete = false } = {}) {
  const plan = await planSync()
  const { creates, updates } = plan._internal
  const deletes = confirmDelete ? plan._internal.deletes : []
  if (!confirmDelete && plan._internal.deletes.length) {
    plan.notices.push(`삭제 대상 ${plan._internal.deletes.length}건은 동의 없이 건너뛰었습니다`)
  }
  const errors = [...plan.errors]
  const now = new Date().toISOString()
  let created = 0
  let updated = 0
  let deleted = 0

  // 파일별로 심을 id 를 모은다 — 한 파일에서 경험 여러 개가 새로 생기면
  // 한 번에 넣어야 삽입 때문에 라인 번호가 밀리지 않는다 (injectNoteIds).
  const pendingIds = new Map()

  for (const c of creates) {
    try {
      const exp = { ...c.patch, id: c.id, createdAt: now, updatedAt: now }
      exp.embedding = await embedExperience(exp)
      await store.insert(exp)
      if (c.needsId) {
        if (!pendingIds.has(c.filename)) pendingIds.set(c.filename, [])
        pendingIds.get(c.filename).push({ id: c.id, headLine: c.headLine })
      }
      created++
    } catch (err) {
      errors.push({ source: c.source, reason: err.message })
    }
  }

  for (const [filename, items] of pendingIds) {
    try {
      await injectNoteIds(filename, items) // 다음 동기화가 같은 경험으로 인식하도록
    } catch (err) {
      errors.push({ source: filename, reason: `id 를 노트에 심지 못했습니다: ${err.message}` })
    }
  }

  for (const u of updates) {
    try {
      const prev = await store.getRaw(u.id)
      if (!prev) throw new Error('DB 에서 경험을 찾을 수 없습니다')
      const merged = { ...prev, ...u.patch, updatedAt: now }
      merged.embedding = await embedExperience(merged) // 내용이 바뀌었으니 재임베딩
      await store.update(u.id, merged)
      updated++
    } catch (err) {
      errors.push({ source: u.source, reason: err.message })
    }
  }

  for (const d of deletes) {
    try {
      await store.remove(d.id)
      await deleteExperienceNote(d.id) // 이미 없지만 파일명 변경 등으로 남아 있을 수 있다
      deleted++
    } catch (err) {
      errors.push({ id: d.id, reason: err.message })
    }
  }

  return {
    applied: true,
    created,
    updated,
    deleted,
    unchanged: plan.unchanged.length,
    errors,
    notices: plan.notices,
    details: { creates: plan.creates, updates: plan.updates, deletes: deletes.map((d) => ({ id: d.id, title: d.title })) },
  }
}

// 부트스트랩/구조 도구: 볼트에 노트가 없는 DB 경험을 마크다운으로 내보낸다.
// 볼트를 처음 쓰기 시작할 때(기존 DB 경험에는 노트가 없다) 삭제 대상이 생기지 않게 하는 출구다.
export async function exportMissingNotes() {
  const plan = await planSync()
  const exported = []
  const errors = []
  // 안전장치로 deletes 가 비워졌더라도 orphans 기준으로 내보낸다 (내보내기는 파괴적이지 않다).
  for (const d of plan._internal.orphans) {
    try {
      const exp = await store.get(d.id)
      if (exp) {
        await saveExperienceNote(exp)
        exported.push({ id: exp.id, title: exp.title })
      }
    } catch (err) {
      errors.push({ id: d.id, reason: err.message })
    }
  }
  return { exported: exported.length, details: exported, errors, notices: plan.notices }
}

// 계획만 돌려준다 (미리보기 응답에서 내부 필드는 제거).
export async function previewSync() {
  const { _internal, ...rest } = await planSync()
  return { applied: false, ...rest }
}
