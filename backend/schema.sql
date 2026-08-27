-- docs/experience-schema.md 정의를 그대로 따른다.
CREATE EXTENSION IF NOT EXISTS vector;

-- id는 UUID가 아니라 TEXT다: eval/seed-experiences.json, eval/retrieval-cases.json 이
-- "exp-001" 같은 안정 문자열 id를 참조하므로 (docs/experience-schema.md 의 UUID 예시에서 의도적으로 벗어남).
CREATE TABLE IF NOT EXISTS experience (
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

CREATE INDEX IF NOT EXISTS experience_embedding_hnsw_idx
    ON experience USING hnsw (embedding vector_cosine_ops);
