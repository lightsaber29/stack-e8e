// 로컬 임베딩 모듈. ARCHITECTURE.md 3번: 독립된 Python 서비스(BGE-M3)를 호출한다.
// Privacy: 텍스트는 이 프로세스와 127.0.0.1(loopback) 임베딩 서비스를 벗어나지 않는다.
// 외부 AI/Embedding API 미사용. 서비스 실행: embedding-py/service.py (venv: embedding-py/.venv)
export const MODEL_NAME = 'BAAI/bge-m3'
export const EMBED_DIM = 1024

const SERVICE_URL = process.env.EMBED_SERVICE_URL || 'http://127.0.0.1:8788'

// retrieval eval(eval/run-retrieval.mjs) 로 확인: query 쪽에 "query: " 프리픽스를 붙이면
// BGE-M3 dense 임베딩의 판별력이 개선된다 (passage 쪽은 프리픽스 없음, 비대칭).
function withPrefix(text, kind) {
  return kind === 'query' ? `query: ${text}` : text
}

export async function embed(text, kind = 'passage') {
  const res = await fetch(`${SERVICE_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [withPrefix(text, kind)] }),
  })
  if (!res.ok) throw new Error(`embedding service error: ${res.status}`)
  const { embeddings } = await res.json()
  return embeddings[0]
}

// docs/search-spec.md 의 포맷으로 Experience → 임베딩 대상 텍스트를 구성한다.
export function buildEmbeddingText(exp) {
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v || '')
  return [
    `Title:\n${exp.title || ''}`,
    `Situation:\n${exp.situation || ''}`,
    `Problem:\n${exp.problem || ''}`,
    `Action:\n${exp.action || ''}`,
    `Result:\n${exp.result || ''}`,
    `Technologies:\n${arr(exp.technologies)}`,
    `Roles:\n${arr(exp.roles)}`,
    `Keywords:\n${arr(exp.keywords)}`,
  ].join('\n\n')
}

export async function embedExperience(exp) {
  return embed(buildEmbeddingText(exp), 'passage')
}

// 정규화된 벡터라 내적 = 코사인 유사도.
export function cosine(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
