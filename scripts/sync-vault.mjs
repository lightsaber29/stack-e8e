#!/usr/bin/env node
// Obsidian 볼트(.md) → DB 동기화 CLI.
//   node scripts/sync-vault.mjs                        # 미리보기(dry-run) — DB 를 건드리지 않는다
//   node scripts/sync-vault.mjs --apply                # 신규/갱신 반영 (삭제는 하지 않는다)
//   node scripts/sync-vault.mjs --apply --with-delete  # 삭제까지 반영
//   node scripts/sync-vault.mjs --export               # 볼트에 노트가 없는 DB 경험을 .md 로 내보낸다
// 백엔드 HTTP 를 거치지 않고 모듈을 직접 호출하지만, 임베딩 서비스(:8788)와 PostgreSQL 은 떠 있어야 한다.
import { previewSync, applySync, exportMissingNotes } from '../backend/vault-sync.mjs'
import { VAULT_DIR } from '../backend/obsidian.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const apply = has('--apply')
const withDelete = has('--with-delete')
const doExport = has('--export')

function line(label, items, fmt) {
  if (!items.length) return
  console.log(`\n${label} (${items.length})`)
  for (const it of items) console.log(`  - ${fmt(it)}`)
}

console.log(`vault: ${VAULT_DIR}`)

if (doExport) {
  const out = await exportMissingNotes()
  console.log(`=== 볼트로 내보내기 ===\nexported=${out.exported}`)
  line('내보냄', out.details, (d) => `${d.title} (${d.id})`)
  line('오류', out.errors, (e) => `${e.id}: ${e.reason}`)
  process.exit(out.errors.length ? 1 : 0)
}

const out = apply ? await applySync({ confirmDelete: withDelete }) : await previewSync()
console.log(apply ? '=== 적용 결과 ===' : '=== 미리보기 (dry-run) ===')

if (apply) {
  console.log(`created=${out.created} updated=${out.updated} deleted=${out.deleted} unchanged=${out.unchanged}`)
  line('신규', out.details.creates, (c) => `${c.source} → ${c.id}`)
  line('갱신', out.details.updates, (u) => `${u.source} (${u.fields.join(', ')})`)
  line('삭제', out.details.deletes, (d) => `${d.id} — ${d.title}`)
} else {
  console.log(`신규 ${out.creates.length} / 갱신 ${out.updates.length} / 삭제 ${out.deletes.length} / 변경없음 ${out.unchanged.length}`)
  line('신규 예정', out.creates, (c) => `${c.source} → ${c.id}`)
  line('갱신 예정', out.updates, (u) => `${u.source} (${u.fields.join(', ')})`)
  line('삭제 예정', out.deletes, (d) => `${d.id} — ${d.title}`)
}

const listed = apply ? [...out.details.creates, ...out.details.updates] : [...out.creates, ...out.updates]
line('경고', listed.filter((x) => x.warnings?.length), (w) => `${w.source}: ${w.warnings.join(' / ')}`)
line('안내', out.notices, (n) => n)
line('오류', out.errors, (e) => `${e.source || e.id}: ${e.reason}`)

if (!apply && (out.creates.length || out.updates.length)) {
  console.log('\n반영하려면: npm run sync:vault -- --apply')
}
if (!apply && out.deletes.length) {
  console.log('삭제까지 반영하려면: npm run sync:vault -- --apply --with-delete')
  console.log('지우지 않고 볼트로 꺼내려면: npm run sync:vault -- --export')
}

process.exit(out.errors.length ? 1 : 0)
