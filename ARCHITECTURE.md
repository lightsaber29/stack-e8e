# Architecture Constraints

# 1. Privacy First

Career Memory는 개인정보가 포함된 시스템이다.

다음 데이터는 외부 서비스로 전송해서는 안 된다.

- Experience 원문
- 회사명
- 프로젝트명
- 경력 내용
- 검색 Query
- 생성된 Embedding

**단 하나의 예외**: 아래 2번의 "대화형 입력 예외" 조건을 모두 만족하는 경우에 한해,
사용자가 대화창에 직접 입력한 내용은 사용자 본인의 Claude 계정으로 전송될 수 있다.
저장된 Experience 원문, 검색 Query, Embedding 은 이 예외에 포함되지 않는다.

---

# 2. Forbidden

다음 서비스를 사용한 데이터 전송을 금지한다.

- OpenAI API
- Google Gemini API
- Cohere API
- Voyage API
- 기타 외부 Embedding API

Telemetry 또는 Analytics를 통해 경험 원문이 외부로 전달되어서도 안 된다.

## 대화형 입력 예외 (Anthropic / Claude)

Anthropic API 는 **대화형 경험 입력 기능에 한해서만** 허용한다.
다음 조건을 **모두** 만족해야 한다.

1. **사용자 본인 세션만 사용한다.** 사용자의 로컬 Claude Code 세션
   (`claude login` 으로 이미 인증된 상태)을 재사용한다.
   앱은 API 키를 저장·요구·전송하지 않으며, 개발자가 관리하는 키나 서버를
   경유하지 않는다.
2. **전송 범위는 대화 입력으로 한정한다.** 사용자가 대화창에 직접 입력한 내용과
   그 대화의 문맥만 전송한다. DB에 저장된 다른 Experience, 검색 Query,
   Embedding vector 는 전송하지 않는다.
   사용자가 이번 입력을 위해 직접 업로드한 파일(md/pdf 등) 원문도 여기 포함된다 —
   업로드도 "이번에 사용자가 준 입력"이라는 점에서 대화창 타이핑과 동일하게 취급한다
   (2026-08-14 확장, 배경은 DECISIONS.md 참고).
3. **도구 권한을 최소로 제한한다.** 에이전트에는 구조화 결과를 돌려주는 도구
   하나만 노출한다. bash · 파일시스템 · 네트워크 등 범용 도구를 노출하지 않는다.
4. **임베딩과 검색은 예외가 아니다.** Embedding 생성과 유사도 검색은 3번·4번대로
   로컬 BGE-M3 + pgvector 로만 수행한다. 이 경로에는 어떤 외부 AI API도 쓰지 않는다.
5. **이 기능 없이도 앱은 동작해야 한다.** Claude Code 가 설치·로그인되어 있지 않으면
   대화형 입력만 비활성화되고, 폼 직접 입력 · 검색 · CRUD 는 그대로 오프라인으로
   동작해야 한다.

조건을 하나라도 만족하지 못하면 Privacy Evaluation 실패로 간주한다.

---

# 3. Embedding

Embedding은 로컬 환경에서 실행한다.

Default:

BAAI/bge-m3

embedding dimension:

1024

Embedding service는 독립된 Python 서비스로 구성할 수 있다.

예:

Backend
   ↓
Local Embedding Service
   ↓
BGE-M3

Embedding Service는 인터넷 연결 없이도 inference가 가능해야 한다.

---

# 4. Database

PostgreSQL

Extension:

pgvector

Experience embedding:

vector(1024)

---

# 5. Recommended Architecture

Frontend
React / Next.js

        ↓ HTTP

Backend
Spring Boot

        ↓

PostgreSQL + pgvector

        ↑

Local Embedding Service
Python
sentence-transformers
BGE-M3

---

# 6. Data Flow

Experience 저장

Client
 ↓
Backend
 ↓
Embedding Service
 ↓
BGE-M3
 ↓
1024-d vector
 ↓
PostgreSQL

검색

Query
 ↓
Embedding Service
 ↓
Query embedding
 ↓
pgvector similarity search
 ↓
TOP K Experience

---

# 7. Security Rule

애플리케이션 코드에서 외부 AI API 호출이 발견되면
Privacy Evaluation 실패로 간주한다.

예외는 2번의 "대화형 입력 예외" 하나뿐이며, 그 예외는 대화형 입력 모듈 안에서만
허용된다. `scripts/privacy-check.sh` 는 이 모듈 경로만 명시적으로 예외 처리하고,
나머지 경로에서는 지금과 동일하게 실패시켜야 한다.
예외 범위를 넓히는 방식으로 검사를 완화하지 않는다.

대화 내용도 로그로 출력하지 않는다 (메타데이터만).

Experience 원문을 로그로 출력하지 않는다.

검색 Query 전체를 production 로그로 출력하지 않는다.

Embedding vector 전체를 로그로 출력하지 않는다.
