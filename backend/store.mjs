// PostgreSQL + pgvector 스토어. backend/schema.sql 의 experience 테이블을 사용한다.
import pg from 'pg'

const { Pool } = pg

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:career_memory_local@127.0.0.1:5432/career_memory'

const pool = new Pool({ connectionString: DATABASE_URL })
// idle 커넥션에서 에러(예: Postgres 재시작)가 나면 pg가 'error' 를 emit한다.
// 리스너가 없으면 처리되지 않은 이벤트로 프로세스가 죽을 수 있어 등록해둔다.
pool.on('error', (err) => console.error(`[db] pool error: ${err.message}`))

const COLUMNS = [
  'id', 'company', 'project', 'period', 'title',
  'situation', 'problem', 'action', 'result',
  'technologies', 'roles', 'keywords', 'metrics',
  'raw_memo', 'embedding', 'created_at', 'updated_at',
]

function toRow(exp) {
  return {
    id: exp.id,
    company: exp.company ?? null,
    project: exp.project ?? null,
    period: exp.period ?? null,
    title: exp.title,
    situation: exp.situation ?? null,
    problem: exp.problem ?? null,
    action: exp.action ?? null,
    result: exp.result ?? null,
    technologies: exp.technologies ?? null,
    roles: exp.roles ?? null,
    keywords: exp.keywords ?? null,
    metrics: exp.metrics ?? null,
    raw_memo: exp.rawMemo ?? null,
    embedding: exp.embedding ? `[${exp.embedding.join(',')}]` : null,
    created_at: exp.createdAt,
    updated_at: exp.updatedAt,
  }
}

function fromRow(row, { withEmbedding = false } = {}) {
  if (!row) return null
  const exp = {
    id: row.id,
    company: row.company,
    project: row.project,
    period: row.period,
    title: row.title,
    situation: row.situation,
    problem: row.problem,
    action: row.action,
    result: row.result,
    technologies: row.technologies,
    roles: row.roles,
    keywords: row.keywords,
    metrics: row.metrics,
    rawMemo: row.raw_memo,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
  if (withEmbedding && row.embedding != null) {
    exp.embedding = parseVector(row.embedding)
  }
  return exp
}

// pgvector는 텍스트 형식 "[0.1,0.2,...]" 로 반환된다.
function parseVector(v) {
  if (Array.isArray(v)) return v
  return v.slice(1, -1).split(',').map(Number)
}

// 목록/상세 응답에서 embedding 은 제외 (용량 + 로그/노출 방지)
export function strip(exp) {
  if (!exp) return exp
  const { embedding, ...rest } = exp
  return rest
}

export async function list() {
  const { rows } = await pool.query(`SELECT ${COLUMNS.join(', ')} FROM experience ORDER BY created_at`)
  return rows.map((r) => fromRow(r))
}

export async function get(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS.join(', ')} FROM experience WHERE id = $1`, [id])
  return fromRow(rows[0])
}

export async function getRaw(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS.join(', ')} FROM experience WHERE id = $1`, [id])
  return fromRow(rows[0], { withEmbedding: true })
}

export async function insert(exp) {
  const row = toRow(exp)
  await pool.query(
    `INSERT INTO experience (${COLUMNS.join(', ')})
     VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})`,
    COLUMNS.map((c) => row[c]),
  )
  return strip(fromRow(row))
}

export async function update(id, patch) {
  const row = toRow(patch)
  const setCols = COLUMNS.filter((c) => c !== 'id')
  const { rows } = await pool.query(
    `UPDATE experience SET ${setCols.map((c, i) => `${c} = $${i + 2}`).join(', ')}
     WHERE id = $1
     RETURNING ${COLUMNS.join(', ')}`,
    [id, ...setCols.map((c) => row[c])],
  )
  if (!rows[0]) return null
  return strip(fromRow(rows[0]))
}

export async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM experience WHERE id = $1', [id])
  return rowCount > 0
}

// pgvector 코사인 거리(<=>) 로 검색. embedding 은 정규화되어 있어 1 - distance = 코사인 유사도.
export async function search(queryEmbedding, topK) {
  const vec = `[${queryEmbedding.join(',')}]`
  const { rows } = await pool.query(
    `SELECT id, title, problem, action, result, 1 - (embedding <=> $1) AS score
     FROM experience
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vec, topK],
  )
  return rows.map((r) => ({ id: r.id, score: Number(r.score), title: r.title, problem: r.problem, action: r.action, result: r.result }))
}
