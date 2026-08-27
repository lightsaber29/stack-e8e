// Retrieval Evaluation 러너.
// 코퍼스: eval/seed-experiences.json, 케이스: eval/retrieval-cases.json
// 규칙(docs/search-spec.md):
//   expectedTop3 -> 해당 id 가 Top 3 안에 있어야 통과
//   expectedAny  -> 목록 중 최소 1건이 Top 5 안에 있으면 통과
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { embed, embedExperience, cosine } from '../embedding/index.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = async (f) => JSON.parse(await readFile(join(__dirname, f), 'utf8'))

const { experiences } = await read('seed-experiences.json')
const { cases } = await read('retrieval-cases.json')

process.stdout.write(`임베딩 생성 중... (${experiences.length}건)\n`)
const corpus = []
for (const e of experiences) corpus.push({ id: e.id, vec: await embedExperience(e) })

let pass = 0
const failures = []
for (const c of cases) {
  const qvec = await embed(c.query, 'query')
  const ranked = corpus
    .map((e) => ({ id: e.id, score: cosine(qvec, e.vec) }))
    .sort((a, b) => b.score - a.score)
  const top5 = ranked.slice(0, 5).map((r) => r.id)
  const top3 = ranked.slice(0, 3).map((r) => r.id)

  let ok, detail
  if (c.expectedTop3) {
    ok = c.expectedTop3.some((id) => top3.includes(id))
    detail = `expectedTop3=[${c.expectedTop3}] top3=[${top3}]`
  } else {
    ok = c.expectedAny.some((id) => top5.includes(id))
    detail = `expectedAny=[${c.expectedAny}] top5=[${top5}]`
  }
  if (ok) pass++
  else failures.push(`  ❌ "${c.query}"\n     ${detail}`)
  console.log(`${ok ? '✅' : '❌'} ${c.query}`)
}

console.log(`\n${pass}/${cases.length} cases passed`)
if (failures.length) {
  console.log('\n실패 상세:')
  console.log(failures.join('\n'))
  process.exit(1)
}
console.log('✅ Retrieval evaluation passed')
