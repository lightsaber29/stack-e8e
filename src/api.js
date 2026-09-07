// API base: 프리뷰에서는 base(/preview/<wsid>/) 하위로 호출해야 게이트웨이가 라우팅한다.
const API = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api'

async function req(path, options) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (res.status === 204) return null
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export const listExperiences = () => req('/experiences')
export const getExperience = (id) => req(`/experiences/${id}`)
export const createExperience = (data) =>
  req('/experiences', { method: 'POST', body: JSON.stringify(data) })
export const updateExperience = (id, data) =>
  req(`/experiences/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteExperience = (id) =>
  req(`/experiences/${id}`, { method: 'DELETE' })
export const search = (query, topK = 5) =>
  req('/search', { method: 'POST', body: JSON.stringify({ query, topK }) })
// 대화형 입력/수정. 저장은 하지 않고 draft 만 돌려준다 (ARCHITECTURE.md 2번 예외).
// experienceId 를 주면 그 경험을 대화로 고치는 모드가 된다.
export const chat = (message, sessionId, experienceId) =>
  req('/chat', { method: 'POST', body: JSON.stringify({ message, sessionId, experienceId }) })
// 파일 업로드 일괄 추출. 파일 하나에 경험이 여러 개면 drafts 배열로 돌아온다.
export const chatUpload = (filename, contentBase64) =>
  req('/chat/upload', { method: 'POST', body: JSON.stringify({ filename, contentBase64 }) })
// Obsidian 볼트(.md) → DB 동기화. apply=false 면 미리보기(계획)만 돌려주고 DB 를 바꾸지 않는다.
export const syncVault = (apply = false, confirmDelete = false) =>
  req('/vault/sync', { method: 'POST', body: JSON.stringify({ apply, confirmDelete }) })
// 볼트에 노트가 없는 DB 경험을 마크다운으로 내보낸다 (삭제 대상을 없애는 안전한 출구).
export const exportVaultNotes = () => req('/vault/export', { method: 'POST' })
// 소재 문서(Sources 폴더) → DB 가져오기. 원본 파일은 수정하지 않는다.
export const importSources = (apply = false) =>
  req('/vault/import', { method: 'POST', body: JSON.stringify({ apply }) })
