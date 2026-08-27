# Search Specification

Experience embedding을 생성할 때 다음 포맷을 사용한다.

```text
Title:
{title}

Situation:
{situation}

Problem:
{problem}

Action:
{action}

Result:
{result}

Technologies:
{technologies}

Roles:
{roles}

Keywords:
{keywords}
```

---

## 예시

```text
Title:
고객정보 브라우저 저장 방식 개선

Situation:
고객정보를 브라우저 저장소에 저장하고 있었다.

Problem:
민감한 고객 데이터가 브라우저에 잔존할 위험이 있었다.

Action:
Vuex 메모리 저장 방식으로 변경하고
새로고침 시 서버에서 다시 조회하도록 수정했다.

Result:
민감정보 브라우저 저장을 제거했다.

Technologies:
Vue2, Nuxt, Vuex

Keywords:
보안, 문제해결, 개선, 상태관리
```

이 전체 텍스트를 임베딩한다.

---

## 규칙

- DB의 모든 문자열을 단순히 이어붙이지 않는다.
- 위 포맷의 라벨(Title, Situation, ...)을 유지한다.
- 배열 필드(technologies, roles, keywords)는 쉼표로 구분하여 나열한다.
- 저장 시와 검색 Query 임베딩 시 동일한 임베딩 모델(BGE-M3)을 사용한다.
- 유사도 검색은 pgvector로 수행하며 Top K(기본 5)를 반환한다.

---

## Retrieval Evaluation 규칙

- 평가 코퍼스는 `eval/seed-experiences.json` 의 16건을 사용한다.
- 케이스는 `eval/retrieval-cases.json` 에 정의한다.
  - `expectedTop3`: 해당 id 가 검색 결과 Top 3 안에 있어야 통과.
  - `expectedAny`: 해당 id 목록 중 **최소 1건**이 Top 5 안에 있으면 통과.
- 코퍼스가 4건이면 Top 5 판정이 항상 통과하여 무의미하므로,
  방해 항목(예: exp-012 일반 CRUD, exp-015 문서 정리)을 포함해 16건으로 확장했다.

> 설계 변경 기록: 초기 하네스에서는 경험 데이터를 `retrieval-cases.json` 에 내장했으나,
> 시딩/데모용과 평가 코퍼스를 단일 출처(`seed-experiences.json`)로 통합하고
> `retrieval-cases.json` 은 id 참조만 하도록 분리했다.
