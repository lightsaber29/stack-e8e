#!/usr/bin/env node
// 소재 문서(Sources 폴더) → DB 가져오기 CLI.
//   node scripts/import-sources.mjs                  # 미리보기(dry-run)
//   node scripts/import-sources.mjs --apply          # 가져오기 (분류 → 임베딩 → 적재 → 경험 노트)
//   node scripts/import-sources.mjs --apply --no-classify   # 분류 없이 적재
//   node scripts/import-sources.mjs --fill-missing --apply  # 이미 적재된 경험의 빈 분류 채우기
// 원본 파일은 읽기만 하고 수정하지 않는다. 이미 가져온 대목은 다시 가져오지 않는다.
// 임베딩 서비스(:8788)와 PostgreSQL 은 떠 있어야 한다(미리보기는 DB 만 필요).
import { previewImport, applyImport, SOURCES_DIR } from '../backend/sources.mjs'
import { fillMissing } from '../backend/classify.mjs'

const apply = process.argv.includes('--apply')
const noClassify = process.argv.includes('--no-classify')
const fillMode = process.argv.includes('--fill-missing')

// 분류는 경험마다 로컬 Claude Code 세션을 한 번 쓰므로 시간이 걸린다 — 진행 상황을 보여준다.
const onProgress = (done, total, r) => {
  const mark = r.filled.length ? r.filled.join(',') : (r.error ? '실패' : '없음')
  process.stdout.write(`  분류 ${done}/${total}  ${(r.exp.title || '').slice(0, 40)} → ${mark}\n`)
}

function line(label, items, fmt) {
  if (!items.length) return
  console.log(`\n${label} (${items.length})`)
  for (const it of items) console.log(`  - ${fmt(it)}`)
}

// 이미 적재된 경험의 빈 분류만 채우는 모드 (가져오기와 별개)
if (fillMode) {
  const res = await fillMissing({ apply, onProgress })
  if (!res.applied) {
    console.log(`=== 분류가 빈 경험 (${res.targets.length}) ===`)
    line('대상', res.targets, (t) => `${t.title} — 빈 필드: ${t.missing.join(', ')}`)
    line('안내', res.notices, (n) => n)
    if (res.targets.length) console.log('\n채우려면: npm run import:sources -- --fill-missing --apply')
  } else {
    console.log(`=== 분류 채우기 결과 ===\nupdated=${res.updated}`)
    line('채움', res.details, (d) => `${d.title} → ${d.filled.join(', ')}`)
    line('안내', res.notices, (n) => n)
    line('오류', res.errors, (e) => `${e.id}: ${e.reason}`)
  }
  process.exit(res.errors.length ? 1 : 0)
}

console.log(`sources: ${SOURCES_DIR}`)
const out = apply ? await applyImport({ classify: !noClassify, onProgress }) : await previewImport()
console.log(apply ? '=== 가져오기 결과 ===' : '=== 미리보기 (dry-run) ===')

if (apply) {
  console.log(`imported=${out.imported} classified=${out.classified} already=${out.already}`)
  line('가져옴', out.details.creates, (c) => `${c.title}${c.filled?.length ? ` [${c.filled.join(', ')}]` : ''}`)
} else {
  console.log(`새로 가져올 것 ${out.creates.length} / 이미 가져옴 ${out.already.length}`)
  line('가져올 예정', out.creates, (c) => `${c.title} ← ${c.source}`)
  line('이미 가져옴', out.already, (a) => a.title)
  line('경고', out.creates.filter((c) => c.warnings?.length), (w) => `${w.source}: ${w.warnings.join(' / ')}`)
}
line('안내', out.notices, (n) => n)
line('오류', out.errors, (e) => `${e.source}: ${e.reason}`)

if (!apply && out.creates.length) {
  console.log('\n가져오려면: npm run import:sources -- --apply')
}

process.exit(out.errors.length ? 1 : 0)
