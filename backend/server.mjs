// Career Memory backend (경량 Node/Express). ARCHITECTURE.md Privacy 규칙 준수.
// 로그에는 id/개수/소요시간 등 비민감 메타데이터만 남긴다 (원문/Query 전체/vector 금지).
import express from 'express'
import { randomUUID } from 'node:crypto'
import * as store from './store.mjs'
import { embed, embedExperience, EMBED_DIM, MODEL_NAME } from '../embedding/index.mjs'
import { saveExperienceNote, deleteExperienceNote } from './obsidian.mjs'
import { chatTurn, chatUpload, isUnavailable } from './chat.mjs'
import pdfParse from 'pdf-parse/lib/pdf-parse.js' // index.js에 있는 디버그 self-test가 ESM에서 항상 실행되는 버그를 피한다

const app = express()
app.use(express.json({ limit: '15mb' })) // 파일 업로드(base64) 수용, 15mb는 텍스트 위주 경력 문서 기준 여유치

const PORT = process.env.PORT || 8787
const FIELDS = ['company', 'project', 'period', 'title', 'situation', 'problem',
  'result', 'action', 'technologies', 'roles', 'keywords', 'metrics', 'rawMemo']

function pick(body) {
  const out = {}
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f]
  return out
}

// async 라우트에서 던진 에러를 Express 에러 처리 체인으로 넘긴다.
// 이게 없으면 unhandled rejection으로 프로세스 전체가 죽는다 (DB/임베딩 서비스 장애 시 특히 위험).
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next)

app.get('/api/health', (_req, res) => res.json({ ok: true, model: MODEL_NAME, dim: EMBED_DIM }))

app.get('/api/experiences', ah(async (_req, res) => {
  res.json(await store.list())
}))

app.get('/api/experiences/:id', ah(async (req, res) => {
  const exp = await store.get(req.params.id)
  if (!exp) return res.status(404).json({ error: 'not found' })
  res.json(exp)
}))

app.post('/api/experiences', ah(async (req, res) => {
  const data = pick(req.body || {})
  if (!data.title) return res.status(400).json({ error: 'title is required' })
  const now = new Date().toISOString()
  const exp = { id: randomUUID(), ...data, createdAt: now, updatedAt: now }
  exp.embedding = await embedExperience(exp)
  const saved = await store.insert(exp)
  await saveExperienceNote(exp)
  console.log(`[create] id=${saved.id}`)
  res.status(201).json(saved)
}))

app.put('/api/experiences/:id', ah(async (req, res) => {
  const existing = await store.getRaw(req.params.id)
  if (!existing) return res.status(404).json({ error: 'not found' })
  const patch = pick(req.body || {})
  const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() }
  merged.embedding = await embedExperience(merged) // 수정 시 재임베딩
  const saved = await store.update(req.params.id, merged)
  await saveExperienceNote(merged)
  console.log(`[update] id=${req.params.id} (re-embedded)`)
  res.json(saved)
}))

app.delete('/api/experiences/:id', ah(async (req, res) => {
  const ok = await store.remove(req.params.id)
  if (!ok) return res.status(404).json({ error: 'not found' })
  await deleteExperienceNote(req.params.id)
  console.log(`[delete] id=${req.params.id}`)
  res.status(204).end()
}))

app.post('/api/search', ah(async (req, res) => {
  const query = (req.body?.query || '').trim()
  const topK = Math.min(Number(req.body?.topK) || 5, 20)
  if (!query) return res.status(400).json({ error: 'query is required' })
  const t0 = Date.now()
  const qvec = await embed(query, 'query')
  const found = await store.search(qvec, topK)
  const ranked = found.map((r) => ({ ...r, score: Number(r.score.toFixed(4)) }))
  // Query 원문/vector 는 로그에 남기지 않는다. 개수/소요시간만.
  console.log(`[search] len=${query.length} results=${ranked.length} ${Date.now() - t0}ms`)
  res.json({ topK, results: ranked })
}))

// 대화형 경험 입력/수정. 저장은 하지 않는다 — draft 를 돌려주면 사용자가 확인 후
// POST /api/experiences(신규) 또는 PUT /api/experiences/:id(수정)로 저장한다.
// experienceId 가 있으면 그 경험 하나만 대화 맥락에 실어 "기존 경험 수정" 모드로 전환한다.
// 대화 내용은 로그에 남기지 않는다 (ARCHITECTURE.md 7번).
app.post('/api/chat', ah(async (req, res) => {
  const message = (req.body?.message || '').trim()
  if (!message) return res.status(400).json({ error: 'message is required' })
  const experienceId = req.body?.experienceId
  let existing = null
  if (experienceId) {
    existing = await store.get(experienceId)
    if (!existing) return res.status(404).json({ error: 'not found' })
  }
  const t0 = Date.now()
  try {
    const out = await chatTurn(message, req.body?.sessionId, existing)
    console.log(`[chat] len=${message.length} draft=${out.draft ? 1 : 0} edit=${existing ? 1 : 0} ${Date.now() - t0}ms`)
    res.json(out)
  } catch (err) {
    if (!isUnavailable(err)) throw err
    console.log(`[chat] unavailable`)
    res.status(503).json({ error: 'Claude Code가 설치·로그인되어 있지 않습니다. 폼으로 직접 입력해 주세요.' })
  }
}))

// md/pdf 파일 업로드 → 일괄 추출. 파일에 경험이 여러 개면 draft 배열로 돌려준다
// (chat.mjs의 chatUpload, ARCHITECTURE.md 2번 예외의 두 번째 진입점).
// 파일명/원문은 로그에 남기지 않는다 — 확장자와 길이/개수만.
app.post('/api/chat/upload', ah(async (req, res) => {
  const filename = String(req.body?.filename || '')
  const contentBase64 = req.body?.contentBase64
  if (!contentBase64) return res.status(400).json({ error: 'contentBase64 is required' })
  const ext = (filename.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase()
  const buf = Buffer.from(contentBase64, 'base64')
  const text = (ext === '.pdf' ? (await pdfParse(buf)).text : buf.toString('utf8')).trim()
  if (!text) return res.status(400).json({ error: '파일에서 텍스트를 추출하지 못했습니다.' })

  const t0 = Date.now()
  try {
    const out = await chatUpload(text)
    console.log(`[chat-upload] ext=${ext || 'txt'} len=${text.length} drafts=${out.drafts.length} ${Date.now() - t0}ms`)
    res.json(out)
  } catch (err) {
    if (!isUnavailable(err)) throw err
    console.log(`[chat-upload] unavailable`)
    res.status(503).json({ error: 'Claude Code가 설치·로그인되어 있지 않습니다. 폼으로 직접 입력해 주세요.' })
  }
}))

// 최종 에러 처리: 원문/vector 는 로그에 남기지 않고 에러 메시지만 기록, 프로세스는 죽지 않는다.
app.use((err, _req, res, _next) => {
  console.error(`[error] ${err.message}`)
  res.status(500).json({ error: 'internal error' })
})

app.listen(PORT, () => console.log(`backend on :${PORT} (model=${MODEL_NAME}, dim=${EMBED_DIM})`))
