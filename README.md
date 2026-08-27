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
└─ obsidian-vault/         경험 마크다운 노트 (부가 출력, Postgres를 대체하지 않음)
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
