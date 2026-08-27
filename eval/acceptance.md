# MVP Acceptance Criteria

## Experience

- [x] Experience 등록 가능
- [x] Experience 조회 가능
- [x] Experience 수정 가능
- [x] Experience 삭제 가능

## Embedding

- [x] BGE-M3가 로컬에서 실행됨 — 독립 Python 서비스(`embedding-py/service.py`, 127.0.0.1:8788)로 실행
- [x] Experience 저장 시 embedding 생성
- [x] Experience 수정 시 embedding 재생성
- [x] embedding dimension = 1024

## Search

- [x] 자연어 query 입력 가능
- [x] query embedding 생성
- [x] pgvector similarity search 수행 (PostgreSQL 17 + pgvector 0.8.0, `<=>` 코사인 거리 + HNSW 인덱스)
- [x] Top 5 결과 반환
- [x] similarity score 반환

## Retrieval Quality

코퍼스: eval/seed-experiences.json (16건)
케이스: eval/retrieval-cases.json 기준

- [x] seed-experiences.json 의 경험이 모두 등록/임베딩됨
- [x] expectedAny 케이스: expected 중 최소 1건이 Top 5 안에 포함
- [x] expectedTop3 케이스: expected 결과가 Top 3 안에 포함

## Privacy

- [x] OpenAI SDK 없음
- [x] Anthropic SDK 없음
- [x] Gemini SDK 없음
- [x] 외부 embedding API 없음
- [x] Experience 원문 외부 전송 없음
- [x] Experience 원문 application log 출력 없음

## Build

- [x] frontend build 성공
- [x] backend test 성공
- [x] embedding service test 성공

## Definition of Done

위 조건을 모두 만족해야 MVP 완료로 판단한다.
