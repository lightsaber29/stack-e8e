# Career Memory

과거의 경력·프로젝트·문제 해결 경험을 구조화하여 저장하고,
자연어 질문으로 관련 경험을 찾아주는 개인 Career Memory 시스템.

이 저장소는 **코딩 에이전트(Claude Code / Codex)에게 통째로 넘겨 구현시키는 하네스**로 구성되어 있다.
프롬프트는 방향만 잡고, 나머지는 문서와 평가 스크립트가 제어한다.

---

## 문서 구조

```text
무엇을 만들 것인가       → PROJECT.md
에이전트는 어떻게 일할까 → AGENTS.md
무엇을 지켜야 하는가     → ARCHITECTURE.md
잘 만들었는지 어떻게 알까 → eval/
```

```text
career-memory/
├─ PROJECT.md              제품 목표 · MVP 범위 · Non Goals
├─ AGENTS.md               에이전트 작업 규칙 (작업 루프 / 완료 기준)
├─ ARCHITECTURE.md         기술 제약 · Privacy First 정책 (권장 스택)
├─ DECISIONS.md            이 환경에서 실제로 채택한 스택과 그 이유
├─ CLAUDE.md               코딩 에이전트용 저장소 가이드
├─ README.md
├─ docs/
│  ├─ experience-schema.md 경험 데이터 구조 + SQL
│  └─ search-spec.md       임베딩 텍스트 포맷 규칙
├─ eval/
│  ├─ seed-experiences.json 시딩/평가 공용 코퍼스 (16건)
│  ├─ retrieval-cases.json  검색 품질 테스트 케이스 (id 참조)
│  ├─ run-retrieval.mjs     retrieval evaluation 러너
│  ├─ privacy-cases.md      개인정보 위반 검사 항목
│  └─ acceptance.md         MVP Acceptance Criteria (Definition of Done)
├─ scripts/
│  ├─ privacy-check.sh     외부 AI SDK 사용 자동 검사
│  ├─ test.sh              build + syntax check
│  └─ eval.sh              privacy → test → retrieval eval 전체 실행
├─ src/                    React 프론트엔드 (루트 Vite 앱)
├─ backend/                Node/Express API (server.mjs, store.mjs, obsidian.mjs)
├─ embedding/              BGE-M3 임베딩 서비스용 Node HTTP 클라이언트 (index.mjs)
├─ embedding-py/           독립 Python 임베딩 서비스 (service.py, BAAI/bge-m3, 127.0.0.1 전용)
└─ stack-e8e-vault/        경험 마크다운 노트 (부가 출력, Postgres를 대체하지 않음)
```

> `backend/`, `embedding/`+`embedding-py/`, `src/`, DB는 `ARCHITECTURE.md`가 권장하는
> Node 프론트/백엔드는 그대로, Python·BGE-M3 임베딩 서비스 + PostgreSQL+pgvector 스택으로
> 운영 중이다 (2026-08-13부터 영구 전환, 임시 대체가 아님). Privacy First 규칙은 그대로 유지된다.
> 전환 배경과 로컬 실행에 필요한 것은 `DECISIONS.md` 참고.

---

## 코딩 에이전트 시작 프롬프트

현재 디렉터리에 있는 문서를 먼저 읽고 Career Memory 프로젝트를 구현한다.
반드시 다음 순서로 작업한다.

1. `PROJECT.md` 를 읽고 제품 목표와 MVP 범위를 파악한다.
2. `ARCHITECTURE.md` 를 읽고 기술적 제약과 개인정보 보호 정책을 확인한다.
3. `AGENTS.md` 를 읽고 작업 규칙을 따른다.
4. `eval/` 에 정의된 acceptance criteria 와 retrieval test 를 확인한다.
5. 현재 코드 상태를 분석한다.
6. 필요한 구현 계획을 세운다.
7. 가장 작은 단위부터 구현한다.
8. 구현 후 테스트와 evaluation 을 실행한다.
9. 실패한 항목이 있다면 원인을 분석하고 수정한다.
10. 모든 MVP acceptance criteria 가 통과할 때까지 반복한다.

중요한 제약:

- 경력 원문 및 검색 문장은 외부 AI/Embedding API로 전송하지 않는다.
- 임베딩 모델은 로컬에서 실행한다. 기본 모델은 BGE-M3다 (`embedding-py/service.py`, 127.0.0.1 전용).
- PostgreSQL + pgvector를 사용한다 (`backend/schema.sql`).
- 개인정보 보호 제약을 기능 요구사항보다 우선한다.
- 평가를 통과시키기 위해 테스트를 임의로 완화하거나 삭제하지 않는다.
- 요구사항에 없는 기능을 임의로 확장하지 않는다.
- 중요한 설계 변경이 필요하면 이유를 문서에 남긴다.

목표는 애플리케이션을 실행시키는 것이 아니라
`eval/acceptance.md` 의 MVP 기준을 만족하는 것이다.

---

## 로컬 실행 (전제조건)

PostgreSQL 서비스(`postgresql-x64-17`)와 Python 임베딩 서비스가 먼저 떠 있어야 한다.

```bash
./embedding-py/.venv/Scripts/python.exe embedding-py/service.py   # :8788
npm run backend                                                    # :8787
```

## Obsidian 볼트에 md 를 넣어 DB 에 적재하기

볼트에 폴더가 둘 있고 역할이 다르다.

| 폴더 | 무엇을 두나 | 동작 |
|---|---|---|
| `stack-e8e-vault/Experiences/` | 경험 단위 노트 (경험 하나 = 파일 하나) | **동기화** — 고치면 DB 에 계속 반영된다. frontmatter 에 `id` 가 심어진다 |
| `stack-e8e-vault/Sources/` | 원본 소재 문서 (경험 여러 개가 든 긴 문서) | **1회 가져오기** — 원본은 읽기만 하고 절대 수정하지 않는다 |

### Sources — 원본 문서에서 경험 뽑아오기

이력서 소재 정리처럼 경험 여러 개가 든 문서는 `Sources/` 에 둔다. 화면에서는
**경험 목록 → "소재 문서 가져오기"**, 터미널에서는:

```bash
npm run import:sources              # 미리보기 — 무엇을 가져올지만 보여준다
npm run import:sources -- --apply   # 가져오기 (경험 노트도 함께 생성)
```

가져오면 문서가 경험 단위로 분할되어 DB 에 적재되고, `Experiences/` 에 경험 노트가 생긴다
— **이후로는 그 노트가 소스다.** 원본은 손대지 않은 채 자료로 남는다.

적재 전에 **분류**(technologies / roles / keywords / metrics)를 자동으로 채운다. 로컬 Claude Code
세션을 쓰므로(ARCHITECTURE.md 2번 예외) 경험당 몇 초씩 걸리고, 설치·로그인되어 있지 않으면
분류만 건너뛰고 적재는 그대로 진행된다. 분류 필드는 임베딩 텍스트에 들어가므로 임베딩보다
먼저 채운다. S/P/A/R 원문과 제목은 분류가 건드리지 않는다 — 비어 있는 필드만 채운다.

```bash
npm run import:sources -- --apply --no-classify          # 분류 없이 적재
npm run import:sources -- --fill-missing                 # 분류가 빈 경험 목록만 보기
npm run import:sources -- --fill-missing --apply         # 그 경험들의 빈 분류 채우기(+재임베딩)
```

- **한 번 가져오면 끝이다.** 원본을 고쳐도 반영되지 않고, 새 대목을 덧붙이면 그것만 추가된다.
  내용을 고치려면 `Experiences/` 의 경험 노트를 고치고 볼트 동기화를 돌린다.
- 어떤 대목이 어떤 경험이 됐는지는 `stack-e8e-vault/.career-memory-import.json` 에 기록된다
  (원본에 아무것도 쓰지 않기 위해). 이 파일을 지우면 "가져온 적 없음"이 되지만, 제목이 같은
  경험이 이미 있으면 중복 적재하지 않는다.
- 이미 가져왔다가 DB 에서 지운 경험은 다시 가져오지 않는다(의도적 삭제로 본다).

### Experiences — 경험 노트 동기화

`stack-e8e-vault/Experiences/` 에 `.md` 를 넣어두고 동기화하면 DB(+임베딩)에 적재된다.
화면에서는 **경험 목록 → "볼트 동기화"** 버튼, 터미널에서는:

```bash
npm run sync:vault                        # 미리보기 — DB 를 건드리지 않는다
npm run sync:vault -- --apply             # 신규/갱신 반영 (삭제는 하지 않는다)
npm run sync:vault -- --apply --with-delete  # 볼트에 노트가 없는 경험까지 삭제
npm run sync:vault -- --export            # 노트가 없는 기존 DB 경험을 .md 로 꺼낸다
```

노트 형식 — **한 파일에 경험 하나**를 쓴다. frontmatter 는 없어도 되고, 섹션 헤딩은
영문(`## Situation`)·한글(`## 상황`)·STAR(`### S — Situation`, Task 는 Problem 으로) 다 읽는다.

```markdown
---
title: 사내 배치 잡 실패 알림 자동화
company: 어느 회사
technologies: [Node.js, Slack API]
---

## 상황
새벽 배치가 조용히 실패하는 일이 잦았다.

## 문제
아무도 모르게 데이터가 밀렸다.

## 한 일
실패 시 Slack 알림과 재시도 큐를 넣었다.

## 결과
평균 인지 시간 6시간 → 3분
```

- `title` 은 frontmatter 나 `# 제목`, 없으면 파일명에서 가져온다.
- 처음 적재할 때 frontmatter 에 `id` 를 심는다(파일명은 그대로 둔다). 이후 그 노트를 고치면
  같은 경험이 갱신되고 재임베딩된다.
**한 파일에 경험이 여러 개**여도 된다 — 헤딩 기준으로 자동 분할한다. 다만 원본을 그대로
보존하고 싶으면 `Experiences/` 가 아니라 `Sources/` 에 두고 가져오기를 쓴다(동기화는 파일에
`id` 를 심는다). 섹션이 `### S — Situation`(h3)이면
경계는 `## 제목`(h2)이고, 경계 헤딩 하나가 경험 하나다. 목차·안내처럼 S/P/A/R 이 없는 덩어리는
건너뛴다. 분할된 경험은 헤딩 아래에 `<!-- career-memory-id: ... -->` 주석으로 id 가 심어지므로,
그 블록만 고치면 그 경험만 갱신되고 블록을 지우면 그 경험만 삭제 대상이 된다.

```markdown
## A-1. 첫 번째 경험 제목
### S — Situation
...
### R — Result
...

## A-2. 두 번째 경험 제목
**S** — 헤딩 대신 볼드 라벨로 써도 읽는다.
**R** — 짧은 항목은 이렇게 쓰는 게 편하다.
```

- 한 덩어리 안에서 같은 섹션이 3번 이상 반복되면 적재하지 않는다 — 아직 경험 여러 개가
  섞여 있다는 뜻이고, 뭉쳐서 저장하면 검색이 망가진다. 헤딩을 하나 더 두어 나누면 된다.
- 삭제는 안전장치가 있다: 볼트가 비어 있거나 읽지 못한 노트가 있으면 건너뛰고, 삭제에는
  별도 동의(체크박스 / `--with-delete`)가 필요하다. 볼트를 쓰기 전에 저장한 경험은 노트가 없어
  삭제 대상이 되므로, 먼저 `--export`(또는 "볼트로 내보내기")로 꺼내면 된다.

## 하네스 실행

```bash
# 외부 AI SDK 사용 검사
bash scripts/privacy-check.sh

# build + test
bash scripts/test.sh

# privacy → test → retrieval eval 전체
bash scripts/eval.sh
```

핵심 원칙: **"에이전트에게 잘하라고 부탁한다"가 아니라 "잘못하면 자동으로 실패하도록 만든다".**

---

## 현재 상태

`bash scripts/eval.sh` (privacy check → build/syntax test → retrieval evaluation) 통과 기준으로,
`eval/acceptance.md`의 MVP acceptance criteria를 모두 만족한다.
