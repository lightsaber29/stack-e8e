# Design Decisions (설계 변경 기록)

> AGENTS.md: "구현 중 중요한 설계 변경이 필요하면 이유를 문서에 남긴다."

## 2026-08-13 최초 기록 — 환경 제약에 의한 임시 대체 (이후 철회됨)

이 환경(ThinkCode Vibe 프리뷰)의 최초 실측 결과, 아래 제약 때문에 ARCHITECTURE.md 의
**권장 스택**을 임시로 조정했다.

| 항목 | 결과 |
|---|---|
| Node | v20 ✅ |
| Python3 | ❌ 없음 |
| PostgreSQL / pgvector | ❌ 없음 |
| 디스크 여유 | ~3GB (매우 빠듯) |

당시엔 torch + BAAI/bge-m3(약 2GB+)를 3GB 디스크·Python 부재 환경에서 실행할 수 없어서
Embedding을 Xenova/multilingual-e5-small(transformers.js, 384d)로, DB를 JSON 파일 스토어로
대체했다.

## 2026-08-13 재측정 — 제약 해소 확인, ARCHITECTURE.md 스펙으로 영구 전환

같은 날 환경을 재측정한 결과 제약이 해소되어 있었다 (Python/디스크 문제는 최초 기록 당시의
일시적 상태였다):

| 항목 | 최초 기록 | 재측정 결과 |
|---|---|---|
| Python3 | ❌ 없음 | ✅ 3.14.6 (+ pip) |
| 디스크 여유 | ~3GB | ✅ 385GB |
| PostgreSQL / pgvector | ❌ 없음 | 설치 진행 (아래) |
| MSVC 빌드 도구 | 미확인 | ✅ 이미 설치되어 있음 (pgvector 소스 빌드에 사용) |

이에 따라 **ARCHITECTURE.md 권장 스택으로 영구 전환**했다. 이번 전환은 "검증 후 임시 스택으로
되돌리는 실험"이 아니라, 제약이 사라졌으므로 원래 권장 스택으로 돌아가는 **영구 업그레이드**다.
이후 다시 JSON 파일 스토어 + transformers.js 로 되돌릴 계획은 없다.

### 변경 사항

| 영역 | 이전(임시) | 현재(영구) | 비고 |
|---|---|---|---|
| Embedding 모델 | Xenova/multilingual-e5-small (transformers.js, 384d) | **BAAI/bge-m3 (sentence-transformers, 1024d)** | ARCHITECTURE.md 3번 원복 |
| Embedding 서비스 | backend in-process Node 모듈 | **독립 Python 서비스** (`embedding-py/service.py`, Flask, 127.0.0.1:8788 loopback 전용) | ARCHITECTURE.md 3번 권장 구성 |
| DB | JSON 파일 스토어 + JS 코사인 유사도 | **PostgreSQL 17 + pgvector 0.8.0** (`career_memory` DB, `experience` 테이블, HNSW 코사인 인덱스) | ARCHITECTURE.md 4번 원복 |
| Backend | Node + Express | **Node + Express 유지** | 이 부분은 애초에 "Python/JVM 부재"가 아니라 "프리뷰가 Node/Vite 기반"이 이유였으므로 유지 (CLAUDE.md 참고) |
| Vector dim | 384 | **1024** | 모델 변경에 따름 |

### 스키마 변경: `id` 는 UUID 대신 TEXT

`docs/experience-schema.md` 의 SQL 예시는 `id UUID`이지만, 실제 구현은 `id TEXT`로 만들었다.
이유: `eval/seed-experiences.json`, `eval/retrieval-cases.json` 이 `"exp-001"` 같은 안정 문자열
id를 참조하며(`retrieval-cases.json`은 id 참조만 하는 설계, `docs/search-spec.md` 참고),
AGENTS.md의 Retrieval 규칙("검색 구현 변경 시 반드시 retrieval evaluation을 다시 수행하고
품질 하락 시 완료로 처리하지 않는다")을 지키려면 이 코퍼스를 그대로 써야 한다. 앱이 새로
생성하는 id(`randomUUID()`)도 문자열이라 TEXT 컬럼에 문제없이 저장된다.

### Query 임베딩 prefix (retrieval 품질 회귀 수정)

BGE-M3 전환 직후 `eval/run-retrieval.mjs` 결과가 8/10 (기존 e5-small 대비 회귀, 기존은 10/10)로
나왔다. AGENTS.md Retrieval 규칙상 회귀 상태로 완료 처리할 수 없어 원인을 조사했다.

- Passage(저장) 텍스트는 프리픽스 없이 그대로 임베딩.
- Query(검색) 텍스트에만 `"query: "` 프리픽스를 붙이면 10/10 로 회복됨 (`embedding/index.mjs`
  의 `withPrefix()`).
- 이 프리픽스는 e5 계열 관례이지만 BGE-M3 dense 임베딩에도 검색 판별력을 높이는 효과가
  실측으로 확인되어 그대로 채택했다. Passage 쪽에는 프리픽스를 붙이지 않는다(비대칭).

### Obsidian Vault 마크다운 노트 (신규, 부가 출력)

경험 저장/수정 시 사람이 읽는 마크다운 노트를 `stack-e8e-vault/Experiences/<id>.md` 에도
생성한다 (`backend/obsidian.mjs`). 이는 **PostgreSQL 구조화 저장을 대체하지 않는 부가
출력**이다 — 삭제 시 노트도 함께 삭제되고, 검색/CRUD의 근거는 여전히 PostgreSQL이다.

## 2026-08-14 — 대화형 경험 입력 도입, Privacy First 예외 신설

### 무엇을 바꿨나

경험을 폼에 직접 채워 넣는 대신 **대화로 정리해서 입력**하는 기능을 도입하기로 했다.
이를 위해 지금까지 절대 금지였던 Anthropic/Claude 사용을 **대화형 입력 한정으로** 허용한다.

- `PROJECT.md` Non Goals 에서 "Claude API" 제거 (대화형 입력 한정 조건부 허용).
- `ARCHITECTURE.md` 1번 Privacy First 에 예외 문구, 2번에 "대화형 입력 예외" 5개 조건 추가,
  7번 Security Rule 에 검사 범위 명시.
- 자체 계정 시스템은 여전히 Non Goal 이다. 로그인은 사용자가 이미 가진 Claude Code
  세션을 그대로 쓰고, 앱은 계정도 API 키도 저장하지 않는다.

### 왜

이력서를 쓰려고 과거 경험을 떠올릴 때, 정작 어려운 건 저장이 아니라 **정리**다.
빈 폼의 Situation/Problem/Action/Result 칸을 스스로 채우는 것 자체가 원래 풀려던 문제였다.
누가 되물어주면서 정리해주는 형태가 이 제품의 핵심 가치에 더 가깝다고 판단했다.

### 대가 (알고 받아들인 것)

이 예외는 공짜가 아니다. 다음을 알고 채택했다.

1. **사용자가 대화창에 입력한 경력 내용은 로컬을 벗어난다.** 계정이 사용자 본인 것이어도
   "외부 전송 금지"의 실질적 완화다. 저장된 Experience · 검색 Query · Embedding 은
   여전히 나가지 않는다.
2. **완전 오프라인 속성을 일부 잃는다.** 그래서 예외 조건 5번(이 기능 없이도 나머지는
   오프라인으로 동작)을 넣었다 — 대화형 입력은 어디까지나 부가 경로다.
3. **도구 노출 위험.** Agent SDK 를 넓게 열면 개인 경험 앱이 임의 명령 실행기가 된다.
   조건 3번(도구 하나만 노출)은 권고가 아니라 필수다.
4. **비결정성.** 대화 추출 결과는 `eval/run-retrieval.mjs` 같은 결정론적 자동 평가로
   검증할 수 없다. 그래서 저장 전 사용자 확인·수정 단계를 필수로 뒀다.
5. **외부 의존성.** 사용자 PC 에 Claude Code 가 설치·로그인되어 있어야 한다.
   "저장소 하나로 완결되는 로컬 스택"이라는 성격이 여기서 깨진다.
6. **구독 사용량을 나눠 쓴다.** API 키 과금은 아니지만 사용자의 Claude 구독 한도를 소모한다.

### 아직 하지 않은 것

문서만 먼저 정리했다. 코드와 `scripts/privacy-check.sh` 예외 처리는 아직 반영하지 않았다.
현재 검사는 `anthropic` 문자열을 무조건 실패시키므로, 구현 시 **대화형 입력 모듈 경로만**
명시적으로 예외 처리해야 한다. 패턴에 안 걸리게 우회하는 방식은 정책 변경이 아니라 눈속임이므로
쓰지 않는다.

## 유지되는 불변 규칙 (변경 없음)

- Experience 원문 · 회사명 · 검색 Query · Embedding 을 외부 서비스로 전송하지 않는다.
  (2026-08-14 신설된 대화형 입력 예외만 제외 — ARCHITECTURE.md 2번)
- 임베딩은 로컬에서만 추론한다 (모델 가중치 1회 다운로드는 데이터 전송이 아니다).
- OpenAI/Gemini/Cohere/Voyage 등 외부 AI API 미사용.
- 원문 · Query 전체 · Embedding vector · 대화 내용 을 로그에 출력하지 않는다.
- Python 임베딩 서비스는 127.0.0.1(loopback)에만 바인딩되며 인터넷 연결 없이도 inference
  가능해야 한다 (모델은 최초 1회 로컬 캐시로 다운로드됨).

## 2026-08-14: 대화형 입력 예외를 파일 업로드(md/pdf)까지 확장

### 무엇을

`backend/chat.mjs`에 `chatUpload(text)`를 추가했다. 기존 `chatTurn`(타이핑 대화, 왕복 질문 가능)과
같은 파일·같은 도구(`save_experience`) 안에서 동작하는 두 번째 진입점이다 — 새 예외 파일이 아니다.
차이는 단발성(질문 없이 문서 전체를 한 번에 훑음)과, `save_experience`를 여러 번 호출해
경험을 배열(`drafts`)로 돌려줄 수 있다는 점이다.

PDF는 텍스트 추출이 필요해 `pdf-parse`를 의존성으로 추가했다 — 순수 로컬 파싱이라 네트워크
호출이 없고, `scripts/privacy-check.sh`의 검사 대상(외부 AI SDK 패턴)에도 걸리지 않는다.

### 파일에 경험이 여러 개인 경우

문서(이력서/경력기술서) 하나에 프로젝트/직무 단위 경험이 여러 개 섞여 있는 게 일반적이라
가정했다. `chatUpload`의 시스템 프롬프트는 "서로 다른 경험이 여러 개면 각각 나눠서
`save_experience`를 그 개수만큼 반복 호출하라"고 지시하고, `chat.mjs`는 이 호출들을
덮어쓰지 않고 배열에 누적한다. 프론트(`Chat.jsx`)는 이 배열을 받아 항목마다 별도의
확인/수정 폼과 저장 버튼을 보여준다 — 하나를 저장해도 나머지가 사라지지 않는다.

### 예외 조건 재확인 (ARCHITECTURE.md 2번)

1. 사용자 본인 세션만 사용 — 기존과 동일, `chatUpload`도 같은 `query()` 재사용.
2. 전송 범위 — "대화창 직접 입력"의 범위를 "이번 업로드 원문"까지로 문서에 명시적으로
   넓혔다(ARCHITECTURE.md 2번 조건 2). DB에 저장된 다른 Experience/Query/Embedding은
   여전히 전송하지 않는다 — `chatUpload`도 `embedding/`, `store.mjs`를 import하지 않는다.
3. 도구 최소화 — 동일 (`save_experience` 하나만).
4. 임베딩/검색은 예외 아님 — 동일.
5. 기능 없이도 동작 — 동일 (`isUnavailable` 503 처리를 업로드 라우트에도 그대로 적용).

### 트레이드오프

- 대화형 입력과 마찬가지로 문서 원문이 사용자 본인의 Claude 계정으로 나간다. 저장된
  Experience 자체는 여전히 로컬에만 있다.
- 단발 추출이라 되묻지 않는다 — 대화형 입력보다 정보가 덜 채워질 수 있다. 사용자가
  저장 전에 직접 채워 넣어야 한다.
- `express.json` body limit 을 1mb → 15mb로 올렸다 (base64 인코딩 오버헤드 + PDF 크기 고려).
  개인용 단일 사용자 앱이라 리스크는 낮다.

## 2026-09-01 — 볼트 → DB 역방향 동기화

### 무엇을 바꿨나

지금까지 Obsidian 볼트는 **출력 전용**이었다(경험 저장 시 `.md` 를 쓰기만 함). 볼트에
직접 써 넣은 노트를 DB로 가져오는 **역방향 동기화**를 추가한다.

- `backend/obsidian.mjs` — `buildMarkdown()` 의 역함수(`splitNote` — 한 파일을 경험 블록들로
  나눠 파싱)와 볼트 읽기(`readNotes`), 새로 적재된 경험의 id 를 노트에 심는 `injectNoteIds` 추가.
- `backend/vault-sync.mjs` (신규) — 계획 수립(`planSync`) / 적용(`applySync`) /
  노트 없는 경험 내보내기(`exportMissingNotes`).
- `POST /api/vault/sync` (기본은 미리보기, `apply:true` 일 때만 반영),
  `POST /api/vault/export`, `npm run sync:vault`, 경험 목록 화면의 "볼트 동기화" 버튼.

### 정책 결정

- **한 파일에 경험이 여러 개면 헤딩 기준으로 자동 분할한다.** 경계 레벨은 S/P/A/R 섹션
  헤딩 레벨에서 유도한다 — 섹션이 `### S — Situation`(h3)이면 경계는 h2, `## Situation`(h2)이면
  경계는 h1이다. 경계 레벨 헤딩 하나가 경험 하나이고, 그보다 얕은 헤딩(`# A급 소재` 같은
  묶음 제목)은 블록을 끊기만 한다. 섹션 레벨은 최빈값으로 정해 한 곳만 레벨이 다른 문서에
  흔들리지 않게 했다. S/P/A/R 이 없는 덩어리(서두·안내·목차)는 경험으로 보지 않고 건너뛴다.
- **분할된 경험의 id 는 블록 안 주석에 심는다** (`<!-- career-memory-id: ... -->`).
  frontmatter 는 문서당 하나뿐이라 블록마다 id 를 둘 수 없고, 주석은 Obsidian 에서 렌더링되지
  않는다. 첫 블록만 frontmatter id 를 승계한다 — 경험 하나였던 노트에 나중에 경험이 추가돼도
  첫 경험이 중복 생성되지 않도록. 한 파일에 여러 개를 심을 때는 아래에서 위로 삽입한다
  (라인 번호가 밀리지 않게).
- **그래도 거부하는 경우**: 한 블록 안에서 같은 섹션이 3번 이상 반복되거나(더 쪼개야 하는
  덩어리), 섹션이 전혀 없는 8000자 초과 본문. 이어붙여 한 레코드로 만들면 임베딩이 뭉개져
  검색이 망가지므로 적재하지 않고 오류로 알린다.
- **md 가 이긴다.** 노트와 DB 가 다르면 노트 기준으로 갱신하고 **재임베딩**한다.
  단 노트에 없는 필드는 건드리지 않는다(patch 의미) — 손으로 쓴 최소 노트가 기존 값을
  지우지 않도록.
- **삭제도 반영하되 3중 안전장치.** 볼트에 노트가 없는 DB 경험은 삭제 대상이지만,
  (1) 볼트에 `.md` 가 0개면 건너뛴다(경로 오타/볼트 미설정 시 전건 삭제 방지),
  (2) 읽지 못한 노트가 하나라도 있으면 건너뛴다(오판 방지),
  (3) `applySync` 는 `confirmDelete` 를 받았을 때만 지운다(UI 체크박스 / CLI `--with-delete`).
  볼트를 쓰기 전에 저장된 경험은 노트가 없어 삭제 대상이 되므로, 지우지 않고 꺼내는
  출구로 `exportMissingNotes()`("볼트로 내보내기")를 함께 제공한다.
- **관용적 파싱.** frontmatter 가 없어도, 섹션이 한글(`## 상황`)이거나 STAR(`### S — Situation`,
  Task→problem)여도, 헤딩 대신 볼드 라벨(`**S** — ...`, `**A**`)이어도 읽는다. 볼드 라벨은
  헤딩으로 섹션을 못 찾았을 때만 2차로 시도하고, 라벨로 인식되지 않는 볼드는 본문 강조로
  보고 섹션을 끊지 않는다. 섹션이 전혀 없는 짧은 자유 서술은 본문 전체를 Situation 으로
  넣는다(rawMemo 는 `buildEmbeddingText` 에 포함되지 않아 검색되지 않기 때문).
- **파일명·제목은 사용자 것.** 신규 노트를 적재할 때 파일명을 바꾸지 않는다. 블록 제목의
  번호 접두어("A-1.")만 떼어 title 로 쓴다.

### 검증

격리된 DB/볼트로 신규→갱신→변경없음→삭제 경로와 HTTP 라우트를 확인했다. `exportMissingNotes`
로 내보낸 노트를 다시 읽으면 "변경 없음"으로 판정된다 — `buildMarkdown` ↔ `splitNote`
라운드트립이 무손실이라는 뜻이다.

실제 문서로도 확인했다: 이력서 소재 정리 문서(51KB, A급 6 + B급 8) → 경험 14건으로 분할
적재되고, 목차·안내 헤딩 4개는 건너뛰었다. 표로만 된 "함정 8건 모음" 항목은 S/P/A/R 구조가
없어 제외됐다 — 경험 하나가 아니므로 맞는 판정이다. 분할 후 "보안 취약점을 발견하고 수정한
경험" 같은 질의가 해당 경험을 정확히 상위로 올린다(뭉쳤을 때는 불가능한 판별력). 2회차
동기화는 "변경 없음 14"(멱등), 블록 하나만 고치면 그 블록만 갱신, 블록 하나를 지우면 그
경험만 삭제 대상으로 잡힌다. `scripts/eval.sh` 전체 통과, retrieval 10/10 유지.

## 2026-09-01 — 소재 문서 폴더(Sources)와 1회 가져오기

### 무엇을 바꿨나

경험 여러 개가 든 원본 문서(이력서 소재 정리 같은 것)를 **원본 그대로 보존**하면서 쓰기
위해 별도 폴더와 가져오기 경로를 만들었다.

- `stack-e8e-vault/Sources/` — 원본 소재 문서 폴더. **읽기만 하고 절대 수정하지 않는다**
  (Experiences 동기화는 id 주석을 심지만, 여기서는 심지 않는다).
- `backend/sources.mjs` (신규) — `planImport()` / `applyImport()`. 분할은 `splitNote` 재사용.
- `POST /api/vault/import`, `npm run import:sources`, 경험 목록 화면의 "소재 문서 가져오기" 버튼.
- 가져온 경험은 DB 적재 + `Experiences/` 에 경험 단위 노트 생성 → **이후로는 그 노트가 소스**다.

### 정책 결정

- **한 번 가져오면 끝(import), 계속 맞추는 동기화(sync)가 아니다.** 원본을 고쳐도 반영하지
  않고, 새 대목이 생기면 그것만 추가한다. 내용 수정은 Experiences 의 경험 노트에서 한다.
  Sources 는 `readNotes()` 스캔 범위(Experiences 최상위) 밖이라 이중 소스가 생기지 않는다.
- **원본을 수정하지 않으니 매핑은 볼트 숨김 파일에 둔다** — `stack-e8e-vault/.career-memory-import.json`
  에 `{ 파일명: { blocks: { 정규화된_대목_제목: 경험 id } } }` 를 기록한다. 경로는
  `OBSIDIAN_VAULT_DIR` 의 부모에서 파생되므로 볼트를 옮기면 함께 따라온다.
- **이미 가져왔다가 DB 에서 지운 경험은 되살리지 않는다.** 상태 기록에는 있으나 DB 에 없으면
  사용자가 의도적으로 지운 것으로 보고 건너뛴다(안내만 표시).
- **제목 중복은 두 겹으로 막는다**: 상태 기록이 없어도 같은 제목의 경험이 이미 DB 에 있으면
  가져오지 않고, 같은 실행 안에서 앞선 문서가 만든 제목도 즉시 등록해 막는다(문서를 복제해
  두 파일에 같은 대목이 있는 경우 — 실측으로 확인한 구멍이다).
- 같은 문서 안에 제목이 같은 대목이 둘 있으면 오류로 알린다(매핑 키가 제목이므로).

### 검증

격리된 DB/볼트로 확인했다: 소재 문서 1개 → 경험 14건 가져오기, **원본 파일은 바이트 단위로
동일**(수정 없음), `Experiences/` 에 경험 노트 14개 생성. 재실행하면 "이미 가져옴 14 / 새로 0",
원본에 대목을 덧붙이면 그것만 1건 추가, 경험 노트를 고치면 일반 동기화가 그 필드만 갱신한다
(가져오기 직후 동기화는 "변경 없음 14" — 이중 소스가 아니라는 뜻). 경험을 지우고 재가져오면
되살아나지 않고, 문서를 복제해도 중복 적재되지 않는다.

## 2026-09-01 — 분류 채우기, Privacy 예외 조건 2 재확장

### 무엇을 바꿨나

문서를 쪼개 적재하면 S/P/A/R 은 채워지지만 `technologies`/`roles`/`keywords`/`metrics` 가
전부 비어 있었다. 이 필드들은 `buildEmbeddingText()` 에 들어가므로 비어 있으면 검색 품질도
손해다. 분류를 자동으로 채우기로 했다.

- `backend/chat.mjs` 에 `classifyExperience()` 추가 — **기존 예외 파일 안의 세 번째 진입점**.
  새 파일을 만들지 않아 `scripts/privacy-check.sh` 의 allowlist(`^\./backend/chat\.mjs:`)는
  그대로다. 이 경계를 넓히지 않는 것이 이 설계의 핵심 제약이었다.
- `backend/classify.mjs` (신규) — 병합/동시성/재임베딩 오케스트레이션. SDK 를 import 하지
  않으므로 privacy-check 대상 패턴에 걸리지 않는다.
- 가져오기 파이프라인(`applyImport`)이 **임베딩보다 먼저** 분류를 호출한다.
- `npm run import:sources -- --fill-missing --apply` — 이미 적재된 경험의 빈 분류 채우기
  (분류 도입 전에 들어온 경험용). 채운 뒤 재임베딩 + 노트 갱신까지 한다.

### 정책 결정

- **분류는 S/P/A/R 원문과 title 을 절대 건드리지 않는다.** 비어 있는 분류 필드만 채우고,
  값이 있는 필드는 덮지 않는다(사용자가 손으로 넣은 값이 이긴다). 원문 변형 위험을 구조적으로
  차단하는 선택이다 — 분류용 도구(`classify_experience`)의 스키마에 S/P/A/R 자체가 없다.
- **도구는 이 호출에서도 하나만.** 예외 조건 3("도구 하나만 노출")을 호출 단위로 유지한다.
- **동시 실행 3개.** 분류 하나가 로컬 CLI 세션 하나를 띄우므로 무제한으로 풀면 로컬이 버티지
  못한다. 14건이 3~4분쯤 걸린다.
- **없어도 동작한다.** `isUnavailable()` 로 CLI 미설치/미로그인을 판별하면 분류를 건너뛰고
  적재는 계속한다(`--no-classify` 로 명시적으로 끌 수도 있다).

### Privacy 예외 조건 2 재확장 (ARCHITECTURE.md §2)

분류는 "사용자가 대화창에 입력한 내용"이 아니라 **DB 에 저장된 경험 하나**를 보낸다.
조건 2 를 다음과 같이 명시적으로 넓혔다 — 몰래 넓히지 않고 문서에 적는 것이 이 프로젝트의 규칙이다.

- 대상은 **그 경험 하나의 title 과 S/P/A/R** 뿐이다. 다른 Experience, 검색 Query, Embedding 은
  담기지 않는다(`classify.mjs` 가 `store`/`embedding` 을 쓰지만 chat.mjs 로 넘기는 것은 경험 하나뿐).
- 사용자가 버튼/명령으로 시작하지 않으면 전송이 일어나지 않는다.
- 프롬프트는 "본문에 실제로 등장한 것만, 근거 없으면 비워 둘 것"을 강제한다.

### 검증

경험 1건으로 먼저 확인했을 때 `technologies` 에 코드 식별자(`service_role`,
`public.public_profiles`)가, `metrics` 에 표의 행이 섞였다. 프롬프트에 "코드 식별자·테이블/컬럼/
함수명·설정 키는 기술이 아니다", "숫자와 단위가 있는 측정값만, 표의 행을 옮기지 않는다"를
추가해 다시 돌렸다. 이후 14건 일괄 채우기.

## 로컬 실행에 필요한 것 (실행 환경 노트)

- PostgreSQL 17 서비스(`postgresql-x64-17`)가 실행 중이어야 한다.
- `career_memory` DB에 `vector` 익스텐션과 `experience` 테이블이 있어야 한다
  (`backend/schema.sql`).
- Python 임베딩 서비스가 실행 중이어야 한다:
  `embedding-py/.venv/Scripts/python.exe embedding-py/service.py` (기본 포트 8788).
- `DATABASE_URL`, `EMBED_SERVICE_URL` 환경변수로 접속 정보를 오버라이드할 수 있다
  (기본값은 `backend/store.mjs`, `embedding/index.mjs` 참고).
