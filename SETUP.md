# SETUP — 다른 컴퓨터에 세팅하기

저장소에 없는 것(node_modules, .venv, DB, 모델 캐시)만 만들면 된다.

## 1. 사전 설치

- **Node 20+**, **Python 3.12+**, **Git**
- **PostgreSQL 17** (설치 시 서비스명 `postgresql-x64-17`, superuser 비밀번호 기억)
- **pgvector 0.8.0**
  - Linux/mac: 패키지로 설치 (`apt install postgresql-17-pgvector`, `brew install pgvector`)
  - Windows: 소스 빌드. **Visual Studio Build Tools(C++ 워크로드)** 설치 후
    "x64 Native Tools Command Prompt"에서:

    ```cmd
    set "PGROOT=C:\Program Files\PostgreSQL\17"
    git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
    cd pgvector
    nmake /F Makefile.win
    nmake /F Makefile.win install
    ```

    관리자 권한 프롬프트여야 `install`이 `PGROOT` 아래에 쓸 수 있다.
    성공하면 `CREATE EXTENSION vector;`(3번 단계의 `schema.sql`)가 통과한다.
- (선택) 대화형 입력을 쓰려면 **Claude Code CLI 설치 + 로그인**. 없으면 `/api/chat`만 503이고 나머지는 정상 동작한다.

## 2. 저장소 + Node 의존성

```bash
git clone <repo> && cd stack-e8e
npm install
```

## 3. DB

```bash
psql -U postgres -c "CREATE DATABASE career_memory;"
psql -U postgres -d career_memory -f backend/schema.sql
```

`backend/store.mjs` 기본 접속값은 `postgres://postgres:career_memory_local@127.0.0.1:5432/career_memory`다.
비밀번호가 다르면 그 값에 맞추거나 `DATABASE_URL` 환경변수로 덮어쓴다.

## 4. Python 임베딩 서비스

```bash
python -m venv embedding-py/.venv
./embedding-py/.venv/Scripts/python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
./embedding-py/.venv/Scripts/python.exe -m pip install -r embedding-py/requirements.txt
```

(mac/Linux는 `embedding-py/.venv/bin/python`)

첫 실행 때 BAAI/bge-m3 가중치 약 2GB를 HuggingFace에서 1회 다운로드한다
→ **디스크 여유 5GB 이상, 최초 1회는 인터넷 필요**. 이후엔 오프라인 동작.

## 5. 실행 (순서 중요)

```bash
./embedding-py/.venv/Scripts/python.exe embedding-py/service.py   # :8788, 모델 로딩까지 대기
npm run backend                                                    # :8787
npm run dev                                                        # :5173
```

`tc-dev`는 프리뷰 환경 전용이다. 다른 PC에선 `npm run dev`를 쓰고,
`WORKSPACE_ID`는 설정하지 않는다(base가 `/`가 된다).

## 6. 검증

```bash
bash scripts/eval.sh   # privacy → build/syntax → retrieval eval (10/10 나와야 정상)
curl http://127.0.0.1:8787/api/health
```

`npm run eval:retrieval`은 임베딩 서비스만 있으면 되고 DB는 쓰지 않는다.
즉 4번까지만 해도 검색 품질 검증은 가능하다.

## 주의

- `stack-e8e-vault/Experiences/`와 DB 데이터는 gitignore라 **따라오지 않는다.**
  기존 경험을 옮기려면 `pg_dump career_memory` → 새 PC에서 `psql` 복원
  (임베딩 컬럼도 함께 넘어가므로 재임베딩 불필요).
- 초기 데이터가 필요하면 `eval/seed-experiences.json`을 `POST /api/experiences`로 밀어 넣는다.
  전용 시드 스크립트는 없다.
