# Privacy Evaluation Cases

`scripts/privacy-check.sh` 가 자동 검사하는 규칙과, 사람이 함께 확인하는 항목을 정의한다.

Privacy 검사는 기능 요구사항보다 우선한다. (ARCHITECTURE.md 참고)

---

## 1. Forbidden Dependency (자동)

다음 패턴이 `backend`, `frontend`, `embedding` 코드에서 발견되면 실패로 간주한다.

- `openai`
- `anthropic`
- `@google/generative-ai`, `google-generativeai`
- `cohere`
- `voyageai`

검사 방식: `scripts/privacy-check.sh`

제외 대상: `node_modules`, `.git`, 빌드 산출물, 문서(`docs/`, `eval/`, `*.md`).

---

## 2. Outbound Data (자동 + 수동)

- [ ] 외부 도메인으로 Experience 원문/회사명/프로젝트명/검색 Query 를 전송하는 HTTP 호출이 없다.
- [ ] Embedding 은 로컬 Embedding Service(BGE-M3)로만 생성한다.
- [ ] Telemetry / Analytics SDK 로 경험 원문이 전송되지 않는다.

---

## 3. Logging (수동)

- [ ] Experience 원문을 application log 로 출력하지 않는다.
- [ ] 검색 Query 전체를 production log 로 출력하지 않는다.
- [ ] Embedding vector 전체를 log 로 출력하지 않는다.

로그에는 식별자(id), 결과 개수, 소요 시간 등 비민감 메타데이터만 남긴다.

---

## 4. Definition of Fail

위 항목 중 하나라도 위반하면 Privacy Evaluation 실패로 처리하며,
해당 변경은 완료로 간주하지 않는다.
