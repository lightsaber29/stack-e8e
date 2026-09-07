// Obsidian Vault 마크다운 노트 (부가 출력). diagram.png: Experience Markdown 생성 → Obsidian Vault 저장.
// 구조화 저장(PostgreSQL)을 대체하지 않는다 — 사람이 읽는 부가 뷰일 뿐이다.
// Privacy: 로컬 파일시스템에만 쓴다. 외부 서비스로 전송하지 않는다.
// 파일명은 제목 기반(사람이 Obsidian에서 알아보기 쉽도록), id는 frontmatter 속성으로 보관해
// 제목이 바뀌거나 파일명이 충돌해도 같은 경험의 노트를 안정적으로 찾아 갱신/삭제할 수 있다.
import { readFile, writeFile, unlink, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VAULT_DIR = process.env.OBSIDIAN_VAULT_DIR || join(__dirname, '..', 'stack-e8e-vault', 'Experiences')

const ID_LINE = /^id:\s*"([^"]*)"/m

function slugifyTitle(title) {
  const cleaned = (title || 'untitled')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-') // Windows/Obsidian 에서 금지된 문자
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '') // Windows는 이름 끝 점/공백을 허용하지 않는다
  return (cleaned || 'untitled').slice(0, 150)
}

// vault를 한 번 훑어 frontmatter id → 파일명 맵을 만든다 (기존 노트 찾기 + 파일명 충돌 확인에 공용으로 쓴다).
async function scanVault() {
  const byId = new Map()
  if (!existsSync(VAULT_DIR)) return byId
  for (const f of await readdir(VAULT_DIR)) {
    if (!f.endsWith('.md')) continue
    const content = await readFile(join(VAULT_DIR, f), 'utf8')
    const m = content.match(ID_LINE)
    if (m) byId.set(m[1], f)
  }
  return byId
}

function yamlList(v) {
  const arr = Array.isArray(v) ? v.filter(Boolean) : []
  return arr.length ? `[${arr.map((s) => JSON.stringify(s)).join(', ')}]` : '[]'
}

function buildMarkdown(exp) {
  const frontmatter = [
    '---',
    `id: ${JSON.stringify(exp.id)}`,
    `title: ${JSON.stringify(exp.title || '')}`,
    `company: ${JSON.stringify(exp.company || '')}`,
    `project: ${JSON.stringify(exp.project || '')}`,
    `period: ${JSON.stringify(exp.period || '')}`,
    `technologies: ${yamlList(exp.technologies)}`,
    `roles: ${yamlList(exp.roles)}`,
    `keywords: ${yamlList(exp.keywords)}`,
    `metrics: ${yamlList(exp.metrics)}`,
    `createdAt: ${JSON.stringify(exp.createdAt || '')}`,
    `updatedAt: ${JSON.stringify(exp.updatedAt || '')}`,
    '---',
  ].join('\n')

  const body = [
    `# ${exp.title || ''}`,
    '## Situation',
    exp.situation || '',
    '## Problem',
    exp.problem || '',
    '## Action',
    exp.action || '',
    '## Result',
    exp.result || '',
  ].join('\n\n')

  return `${frontmatter}\n\n${body}\n`
}

export async function saveExperienceNote(exp) {
  await mkdir(VAULT_DIR, { recursive: true })
  const byId = await scanVault()
  const existingFilename = byId.get(exp.id)
  const base = slugifyTitle(exp.title)
  const collides = [...byId].some(([id, f]) => id !== exp.id && f === `${base}.md`)
  const filename = collides ? `${base} (${exp.id.slice(0, 8)}).md` : `${base}.md`
  if (existingFilename && existingFilename !== filename) {
    await unlink(join(VAULT_DIR, existingFilename)).catch(() => {})
  }
  await writeFile(join(VAULT_DIR, filename), buildMarkdown(exp), 'utf8')
}

export async function deleteExperienceNote(id) {
  const filename = (await scanVault()).get(id)
  if (!filename) return
  try {
    await unlink(join(VAULT_DIR, filename))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}
