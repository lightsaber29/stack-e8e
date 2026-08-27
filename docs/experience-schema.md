# Experience Schema

Experience는 프로젝트 전체가 아니라 하나의 의미 있는 사건을 나타낸다.

예:

잘못된 단위:

"라이나생명 프로젝트"

좋은 단위:

"고객정보 브라우저 저장 방식 개선"

---

## Fields

id

company
project
period

title

situation
problem
action
result

technologies[]
roles[]
keywords[]

metrics[]

rawMemo

embedding

createdAt
updatedAt

---

## SQL

> `id`는 UUID가 아니라 TEXT로 구현되어 있다. 이유는 `DECISIONS.md`("id는 UUID 대신 TEXT")
> 참고 — `eval/seed-experiences.json`이 `"exp-001"` 같은 안정 문자열 id를 참조하기 때문이다.

```sql
CREATE TABLE experience (
    id TEXT PRIMARY KEY,

    company VARCHAR(255),
    project VARCHAR(255),
    period VARCHAR(100),

    title VARCHAR(255) NOT NULL,

    situation TEXT,
    problem TEXT,
    action TEXT,
    result TEXT,

    technologies TEXT[],
    roles TEXT[],
    keywords TEXT[],
    metrics TEXT[],

    raw_memo TEXT,

    embedding vector(1024),

    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```
