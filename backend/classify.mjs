// 분류 채우기 오케스트레이션. 실제 분류는 chat.mjs 의 classifyExperience() 가 한다
// (외부 AI 를 쓰는 지점은 여전히 backend/chat.mjs 하나뿐 — 이 파일은 SDK 를 import 하지 않는다).
//
// 원칙:
//   - S/P/A/R 원문과 title 은 절대 건드리지 않는다. 비어 있는 분류 필드만 채운다.
//   - 이미 값이 있는 필드는 덮지 않는다 (사용자가 손으로 넣은 값이 이긴다).
//   - 분류를 못 해도 나머지는 그대로 진행한다 (예외 조건 5번: 이 기능 없이도 동작).
// Privacy: 대상 경험 하나의 필드만 chat.mjs 로 넘어간다. 임베딩/검색 Query 는 여기 들어오지 않는다.
import * as store from './store.mjs'
import { embedExperience } from '../embedding/index.mjs'
import { classifyExperience, isUnavailable } from './chat.mjs'
import { saveExperienceNote } from './obsidian.mjs'

// 분류로 채울 필드 (title/S/P/A/R 은 대상이 아니다)
const LIST_FIELDS = ['technologies', 'roles', 'keywords', 'metrics']
const SCALAR_FIELDS = ['company', 'project', 'period']
export const CLASSIFY_FIELDS = [...LIST_FIELDS, ...SCALAR_FIELDS]

const isEmpty = (v) => (Array.isArray(v) ? v.filter(Boolean).length === 0 : !String(v ?? '').trim())

// 분류를 아직 돌리지 않았는지. technologies 와 keywords 가 **둘 다** 비어 있을 때만 대상으로 본다.
//
// "빈 필드가 하나라도 있으면 대상"으로 잡으면 안 된다 — company/project/period 나 metrics 는
// 본문에 근거가 없으면 분류가 정당하게 비워 두는 필드고, 그러면 매번 같은 경험을 다시
// 분류하느라 LLM 호출만 낭비된다. keywords 는 본문만 있으면 거의 항상 채워지므로
// 이 둘이 동시에 비어 있다는 건 아직 한 번도 분류하지 않았다는 뜻이다.
export function needsClassification(exp) {
  return isEmpty(exp.technologies) && isEmpty(exp.keywords)
}

// 분류 결과를 병합한다. 비어 있는 필드만 채우고, 채운 필드 이름을 함께 돌려준다.
function merge(exp, out) {
  const filled = []
  if (!out) return { exp, filled }
  const next = { ...exp }
  for (const f of LIST_FIELDS) {
    const v = Array.isArray(out[f]) ? out[f].map((s) => String(s).trim()).filter(Boolean) : []
    if (v.length && isEmpty(next[f])) {
      next[f] = v
      filled.push(f)
    }
  }
  for (const f of SCALAR_FIELDS) {
    const v = String(out[f] ?? '').trim()
    if (v && isEmpty(next[f])) {
      next[f] = v
      filled.push(f)
    }
  }
  return { exp: next, filled }
}

// 동시 실행 수. 분류 하나가 CLI 세션 하나를 띄우므로 무제한으로 풀면 로컬이 버티지 못한다.
const CONCURRENCY = 3

// 여러 경험을 분류한다. 원문/DB 를 수정하지 않고 분류가 병합된 사본을 돌려준다.
// 반환: { results: [{ exp, filled, error }], unavailable }
export async function classifyMany(exps, onProgress) {
  const results = new Array(exps.length)
  let unavailable = false
  let cursor = 0
  let done = 0

  async function worker() {
    while (cursor < exps.length) {
      const i = cursor++
      const exp = exps[i]
      if (unavailable) {
        results[i] = { exp, filled: [], error: 'skipped' }
        continue
      }
      try {
        const out = await classifyExperience(exp)
        results[i] = merge(exp, out)
      } catch (err) {
        // CLI 미설치/미로그인이면 나머지도 다 실패한다 — 한 번 확인하고 조용히 건너뛴다.
        if (isUnavailable(err)) unavailable = true
        results[i] = { exp, filled: [], error: err.message }
      }
      onProgress?.(++done, exps.length, results[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, exps.length) }, worker))
  return { results, unavailable }
}

// 이미 DB 에 있는 경험들의 빈 분류 필드를 채운다 (가져오기 전에 적재된 것들 대상).
// 분류 필드는 임베딩 텍스트에 들어가므로 채운 뒤 반드시 재임베딩한다.
export async function fillMissing({ apply = false, onProgress } = {}) {
  const all = await store.list()
  const targets = all.filter(needsClassification)
  if (!apply || !targets.length) {
    return {
      applied: false,
      targets: targets.map((e) => ({ id: e.id, title: e.title, missing: CLASSIFY_FIELDS.filter((f) => isEmpty(e[f])) })),
      updated: 0,
      errors: [],
      notices: targets.length ? [] : ['빈 분류 필드가 있는 경험이 없습니다'],
    }
  }

  const { results, unavailable } = await classifyMany(targets, onProgress)
  const errors = []
  const details = []
  let updated = 0

  for (const r of results) {
    if (!r.filled.length) {
      if (r.error && r.error !== 'skipped') errors.push({ id: r.exp.id, reason: r.error })
      continue
    }
    try {
      const prev = await store.getRaw(r.exp.id)
      if (!prev) throw new Error('DB 에서 경험을 찾을 수 없습니다')
      const merged = { ...prev, ...r.exp, updatedAt: new Date().toISOString() }
      merged.embedding = await embedExperience(merged) // 분류가 임베딩 텍스트에 들어간다
      await store.update(r.exp.id, merged)
      await saveExperienceNote(merged)
      updated++
      details.push({ id: r.exp.id, title: r.exp.title, filled: r.filled })
    } catch (err) {
      errors.push({ id: r.exp.id, reason: err.message })
    }
  }

  const notices = []
  if (unavailable) notices.push('Claude Code 세션을 쓸 수 없어 일부를 건너뛰었습니다 (설치·로그인 확인)')

  return { applied: true, updated, errors, notices, details }
}
