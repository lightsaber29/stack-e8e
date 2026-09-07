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

// ────────────────────────────────────────────────────────────────
// 역방향(볼트 → DB) 동기화용: buildMarkdown 의 역함수.
// 사용자가 Obsidian 에서 직접 쓴 노트도 받아들여야 하므로 관용적으로 파싱한다
// (frontmatter 없음, 한글 섹션 헤딩, 섹션 없는 자유 서술 등).
// Privacy: 파일 내용은 이 프로세스 밖으로 나가지 않는다.
// ────────────────────────────────────────────────────────────────

// 섹션 헤딩 별칭. 손으로 쓴 노트가 영문 스펙 헤딩을 따르지 않는 경우를 흡수한다.
// STAR(S/T/A/R) 로 쓴 노트도 받는다: Task 는 이 스키마의 problem 에 해당한다.
const SECTION_ALIASES = {
  situation: ['situation', 's situation', 's', '상황', '배경'],
  problem: ['problem', 'p problem', 'task', 't task', 't', 'p', '문제', '과제'],
  action: ['action', 'a action', 'a', '행동', '한 일', '해결', '조치'],
  result: ['result', 'r result', 'r', '결과', '성과'],
  rawMemo: ['memo', 'rawmemo', 'raw memo', '메모', '원문'],
}
const SECTION_BY_HEADING = new Map()
for (const [field, names] of Object.entries(SECTION_ALIASES)) {
  for (const n of names) SECTION_BY_HEADING.set(n, field)
}

// 헤딩 텍스트를 별칭 조회용 키로 정규화한다.
// "S — Situation" → "s situation", "**Result**" → "result".
// 번호 접두어("A-1.")는 제거하지 않는다 — 'A' 를 Action 으로 오인하면 안 되기 때문이다.
function headingKey(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z가-힣0-9 ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// 이 길이를 넘고 S/P/A/R 섹션이 없으면 '경험 여러 개가 든 문서'로 보고 적재를 거부한다.
const MULTI_DOC_CHARS = 8000

const LIST_FIELDS = ['technologies', 'roles', 'keywords', 'metrics']
const SCALAR_FIELDS = ['id', 'title', 'company', 'project', 'period', 'createdAt', 'updatedAt']

function unquote(s) {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      return t.startsWith('"') ? JSON.parse(t) : t.slice(1, -1)
    } catch {
      return t.slice(1, -1)
    }
  }
  return t
}

function parseInlineList(raw) {
  const inner = raw.slice(1, -1).trim()
  if (!inner) return []
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  } catch {
    // JSON 이 아니면 콤마 분해로 폴백 (손으로 쓴 [a, b] 형태)
  }
  return inner.split(',').map((s) => unquote(s)).filter(Boolean)
}

// YAML 전체를 지원하지 않는 최소 파서: `key: scalar`, `key: [a, b]`, `key:` + `- item` 블록만.
function parseFrontmatter(text) {
  const out = {}
  let curKey = null
  for (const line of text.split(/\r?\n/)) {
    const item = line.match(/^\s*-\s+(.*)$/)
    if (item && curKey) {
      if (!Array.isArray(out[curKey])) out[curKey] = []
      const v = unquote(item[1])
      if (v) out[curKey].push(v)
      continue
    }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) continue
    curKey = kv[1]
    const raw = kv[2].trim()
    if (raw.startsWith('[') && raw.endsWith(']')) out[curKey] = parseInlineList(raw)
    else out[curKey] = unquote(raw)
  }
  return out
}

function splitFrontmatter(content) {
  const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { fm: {}, body: content, bodyStartLine: 0 }
  return {
    fm: parseFrontmatter(m[1]),
    body: content.slice(m[0].length),
    bodyStartLine: m[0].split('\n').length - 1, // 파일 전체 기준 라인 오프셋 (id 주석 삽입 위치 계산용)
  }
}

// 여러 경험이 든 문서에서 각 경험의 id 를 블록 안에 심어둘 때 쓰는 주석.
// frontmatter 는 문서당 하나뿐이라 블록마다 id 를 둘 수 없고, 주석은 Obsidian 에서 렌더링되지 않는다.
const ID_COMMENT = /^\s*<!--\s*career-memory-id:\s*([^\s>]+?)\s*-->\s*$/
export const idCommentLine = (id) => `<!-- career-memory-id: ${id} -->`

const HEADING = /^(#{1,6})\s+(.*)$/

// 블록 제목에서 번호 접두어를 떼어낸다: "A-1. 결함 4건 발견" → "결함 4건 발견".
function stripNumberPrefix(text) {
  const t = text.replace(/^\s*(?:[A-Za-z]{1,2}[-–—]?)?\d{1,3}\+?\s*[.)\]]\s*/, '').trim()
  return t || text.trim()
}

// 헤딩 대신 볼드 라벨로 쓴 경험도 받는다: `**S** — 상황...`, `**A**`, `**R** — 결과...`.
// 짧은 항목을 헤딩 없이 쓰는 흔한 형식이라 이걸 못 읽으면 문서 절반이 누락된다.
const BOLD_LABEL = /^\*\*\s*([^*]{1,24}?)\s*\*\*\s*[—–\-:]?\s*(.*)$/

function parseBoldSections(lines) {
  const sections = {}
  const seenCount = {}
  let cur = null
  for (const line of lines) {
    const m = line.match(BOLD_LABEL)
    const field = m ? SECTION_BY_HEADING.get(headingKey(m[1])) : null
    if (field) {
      cur = field
      sections[cur] = sections[cur] ?? []
      seenCount[cur] = (seenCount[cur] ?? 0) + 1
      if (m[2]) sections[cur].push(m[2])
      continue
    }
    // 라벨로 인식되지 않는 볼드는 본문 강조일 뿐이므로 섹션을 끊지 않는다.
    if (cur) sections[cur].push(line)
  }
  return { sections, seenCount }
}

function fmPatch(fm, { withTitle }) {
  const patch = {}
  for (const f of SCALAR_FIELDS) {
    if (f === 'title' && !withTitle) continue // 여러 경험이 든 문서에서 제목을 상속하면 전부 같은 제목이 된다
    if (typeof fm[f] === 'string' && fm[f] !== '') patch[f] = fm[f]
    else if (Array.isArray(fm[f]) && fm[f].length) patch[f] = fm[f].join(', ')
    else if (f in fm) patch[f] = '' // 명시적 빈 값은 빈 값으로 반영
  }
  for (const f of LIST_FIELDS) {
    if (Array.isArray(fm[f])) patch[f] = fm[f]
    else if (typeof fm[f] === 'string') patch[f] = fm[f] ? fm[f].split(',').map((s) => s.trim()).filter(Boolean) : []
  }
  return patch
}

// 블록(경험 하나) 본문을 파싱한다. 반환 patch 에는 실제로 존재한 필드만 담는다
// (없는 필드는 DB 값을 지우지 않고 그대로 둔다).
function parseBlock({ title, lines }, fm, { filename, isMulti }) {
  const warnings = []
  const patch = fmPatch(fm, { withTitle: !isMulti })
  let sections = {}
  let seenCount = {} // 같은 섹션이 몇 번 나왔는지 — 더 쪼개야 하는 문서를 판별하는 신호
  const unknown = []
  let cur = null
  let h1 = null
  let idFromComment = null

  for (const line of lines) {
    const c = line.match(ID_COMMENT)
    if (c) {
      idFromComment = c[1]
      continue
    }
    const h = line.match(HEADING)
    if (h) {
      const text = h[2].trim()
      if (h[1].length === 1 && h1 === null) {
        h1 = text
        cur = null
        continue
      }
      const field = SECTION_BY_HEADING.get(headingKey(text))
      if (field) {
        cur = field
        sections[cur] = sections[cur] ?? []
        seenCount[cur] = (seenCount[cur] ?? 0) + 1
      } else {
        cur = null
        unknown.push(text)
      }
      continue
    }
    if (cur) sections[cur].push(line)
  }

  // 헤딩으로 섹션을 못 찾았으면 볼드 라벨 형식으로 한 번 더 읽어본다.
  if (!Object.keys(sections).length) ({ sections, seenCount } = parseBoldSections(lines))

  for (const [field, buf] of Object.entries(sections)) patch[field] = buf.join('\n').trim()
  if (unknown.length) warnings.push(`인식하지 못한 섹션 무시: ${unknown.length}개`)

  if (!patch.title) {
    const fallback = title || h1 || filename.replace(/\.md$/i, '').replace(/\s*\([0-9a-f]{8}\)$/i, '')
    if (fallback) patch.title = stripNumberPrefix(fallback)
  }

  // 블록 안에서 같은 섹션이 반복되면 이 블록이 아직 여러 경험을 담고 있다는 뜻이다.
  // 이어붙여 한 레코드로 만들면 임베딩이 뭉개져 검색이 망가지므로 적재하지 않는다.
  const repeat = Math.max(0, ...Object.values(seenCount))
  let fatal = null
  if (repeat >= 3) {
    fatal = `같은 섹션이 ${repeat}번 반복됩니다 — 경험 여러 개가 한 덩어리에 있는 것으로 보입니다. `
      + '경험마다 헤딩을 하나씩 두어 나누거나, 채팅 화면의 파일 업로드로 나눠서 등록하세요.'
  } else if (repeat === 2) {
    warnings.push('같은 섹션이 두 번 나와 이어붙였습니다 — 경험 단위로 나누는 편이 좋습니다')
  }

  const hasSpar = ['situation', 'problem', 'action', 'result'].some((f) => patch[f])
  if (!fatal && !hasSpar) {
    if (isMulti) return null // 여러 경험이 든 문서에서 S/P/A/R 이 없는 덩어리는 경험이 아니다(서두·안내 등)
    // 섹션이 전혀 없는 자유 서술 노트: 검색 대상이 되도록 본문 전체를 Situation 으로 넣는다
    // (buildEmbeddingText 는 rawMemo 를 포함하지 않으므로 rawMemo 에 두면 검색되지 않는다).
    const freeText = lines.filter((l) => !HEADING.test(l) && !ID_COMMENT.test(l)).join('\n').trim()
    if (freeText.length > MULTI_DOC_CHARS) {
      fatal = `경험 하나짜리 노트로 보이지 않습니다 (본문 ${freeText.length}자, 인식된 섹션 없음). `
        + '경험마다 헤딩(## 제목)을 두어 나누거나, 채팅 화면의 파일 업로드로 나눠서 등록하세요.'
    } else if (freeText) {
      patch.situation = freeText
      warnings.push('S/P/A/R 섹션을 찾지 못해 본문 전체를 Situation 으로 넣었습니다')
    }
  }

  return { patch, warnings, fatal, idFromComment }
}

// 노트 하나를 경험 블록들로 나눠 파싱한다 (한 파일에 경험이 여럿일 수 있다).
//
// 경계 레벨은 S/P/A/R 섹션 헤딩 레벨에서 자동으로 정한다: 섹션이 `### S — Situation`(h3)이면
// 경계는 h2 이고, `## Situation`(h2)이면 경계는 h1 이다. 경계 레벨 헤딩 하나가 경험 하나다.
// 경계 레벨보다 얕은 헤딩(`# A급 소재` 같은 묶음 제목)은 블록을 끊기만 한다.
//
// 반환: { blocks: [{ patch, warnings, fatal, id, headLine, isMulti, blockTitle }], skipped, fatal }
//   - headLine: 파일 전체 기준 헤딩 라인 번호 (신규 적재 후 id 주석을 심을 위치)
//   - skipped: S/P/A/R 이 없어 경험으로 보지 않은 덩어리 수
export function splitNote(content, filename = '') {
  const { fm, body, bodyStartLine } = splitFrontmatter(content)
  const lines = body.split(/\r?\n/)

  const headByLine = new Map()
  const sparLevels = {}
  lines.forEach((line, i) => {
    const h = line.match(HEADING)
    if (!h) return
    const text = h[2].trim()
    const level = h[1].length
    const field = SECTION_BY_HEADING.get(headingKey(text)) || null
    headByLine.set(i, { level, text, field })
    if (field) sparLevels[level] = (sparLevels[level] ?? 0) + 1
  })

  // 섹션 레벨은 최빈값으로 정한다 (한 곳만 레벨이 다른 문서에 흔들리지 않도록). 동률이면 얕은 쪽.
  const sparLevel = Object.keys(sparLevels)
    .map(Number)
    .sort((a, b) => sparLevels[b] - sparLevels[a] || a - b)[0]
  const boundary = sparLevel > 1 ? sparLevel - 1 : null

  const raw = []
  if (boundary) {
    let cur = null
    for (let i = 0; i < lines.length; i++) {
      const h = headByLine.get(i)
      if (h && h.level <= boundary) {
        cur = h.level === boundary ? { title: h.text, headLine: i, lines: [] } : null
        if (cur) raw.push(cur)
        continue
      }
      if (cur) cur.lines.push(lines[i])
    }
  }
  // 경계 헤딩이 없으면(또는 섹션 레벨이 h1) 문서 전체를 경험 하나로 본다.
  if (!raw.length) raw.push({ title: null, headLine: null, lines })

  const isMulti = raw.length > 1
  const blocks = []
  let skipped = 0
  raw.forEach((b, idx) => {
    const parsed = parseBlock(b, fm, { filename, isMulti })
    if (!parsed) {
      skipped++
      return
    }
    // id 는 블록 주석이 우선. 첫 블록만 frontmatter id 를 승계한다
    // (경험 하나였던 노트에 나중에 경험이 추가돼도 첫 경험이 중복 생성되지 않도록).
    const id = parsed.idFromComment || (idx === 0 ? (fm.id || '').trim() || null : null)
    blocks.push({
      patch: parsed.patch,
      warnings: parsed.warnings,
      fatal: parsed.fatal,
      id,
      hasIdComment: Boolean(parsed.idFromComment),
      headLine: b.headLine === null ? null : bodyStartLine + b.headLine,
      blockTitle: isMulti ? stripNumberPrefix(b.title || '') : null,
      isMulti,
    })
  })

  const fatal = blocks.length === 0 && skipped > 0
    ? `헤딩 ${skipped}개를 훑었지만 S/P/A/R 섹션을 가진 경험을 찾지 못했습니다`
    : null
  return { blocks, skipped, fatal }
}

// 볼트 최상위의 .md 노트를 모두 읽는다 (하위 폴더는 스캔하지 않는다 — saveExperienceNote 와 동일 규칙).
export async function readNotes() {
  if (!existsSync(VAULT_DIR)) return []
  const out = []
  for (const f of (await readdir(VAULT_DIR)).sort()) {
    if (!f.endsWith('.md')) continue
    out.push({ filename: f, content: await readFile(join(VAULT_DIR, f), 'utf8') })
  }
  return out
}

// 신규 노트에 id 를 심어 다음 동기화가 같은 경험으로 인식하게 한다.
// 사용자가 붙인 파일명은 그대로 둔다 (마음대로 이름을 바꾸지 않는다).
async function injectNoteId(path, id) {
  const content = await readFile(path, 'utf8')
  const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const next = m
    ? content.replace(/^(﻿?---\r?\n)/, `$1id: ${JSON.stringify(id)}\n`)
    : `---\nid: ${JSON.stringify(id)}\n---\n\n${content}`
  await writeFile(path, next, 'utf8')
}

// 파일 하나에 새로 적재된 경험들의 id 를 한 번에 심는다.
// items: [{ id, headLine }] — headLine 이 null 이면(파일 전체가 경험 하나) frontmatter 의 id 로,
// 있으면 그 헤딩 바로 아래에 id 주석으로 심는다. 여러 줄을 삽입하면 뒤 라인 번호가 밀리므로
// 반드시 아래에서 위로(내림차순) 삽입한다.
export async function injectNoteIds(filename, items) {
  const path = join(VAULT_DIR, filename)
  const blockItems = items.filter((it) => it.headLine !== null)
  const wholeFile = items.find((it) => it.headLine === null)

  if (blockItems.length) {
    const lines = (await readFile(path, 'utf8')).split('\n')
    for (const it of [...blockItems].sort((a, b) => b.headLine - a.headLine)) {
      lines.splice(it.headLine + 1, 0, idCommentLine(it.id))
    }
    await writeFile(path, lines.join('\n'), 'utf8')
  }
  if (wholeFile) await injectNoteId(path, wholeFile.id)
}

export { VAULT_DIR }
