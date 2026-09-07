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

## 로컬 실행에 필요한 것 (실행 환경 노트)

- PostgreSQL 17 서비스(`postgresql-x64-17`)가 실행 중이어야 한다.
- `career_memory` DB에 `vector` 익스텐션과 `experience` 테이블이 있어야 한다
  (`backend/schema.sql`).
- Python 임베딩 서비스가 실행 중이어야 한다:
  `embedding-py/.venv/Scripts/python.exe embedding-py/service.py` (기본 포트 8788).
- `DATABASE_URL`, `EMBED_SERVICE_URL` 환경변수로 접속 정보를 오버라이드할 수 있다
  (기본값은 `backend/store.mjs`, `embedding/index.mjs` 참고).
