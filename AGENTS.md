# Agent Instructions

## 기본 원칙

이 프로젝트의 목표는 코드를 많이 작성하는 것이 아니라
Acceptance Criteria를 만족하는 최소한의 시스템을 구현하는 것이다.

---

## 작업 루프

모든 작업은 다음 루프를 따른다.

1. Inspect
2. Plan
3. Implement
4. Test
5. Evaluate
6. Fix

Evaluation을 생략하지 않는다.

---

## 구현 전

관련 요구사항 문서를 먼저 확인한다.

다음 파일의 내용을 임의로 무시하지 않는다.

- PROJECT.md
- ARCHITECTURE.md
- docs/
- eval/

---

## Scope

PROJECT.md의 MVP Scope만 구현한다.

Non Goals에 명시된 기능은 구현하지 않는다.

---

## Privacy

ARCHITECTURE.md의 Privacy 규칙은 가장 높은 우선순위를 가진다.

편의를 위해 외부 AI API를 추가해서는 안 된다.

---

## Testing

기능 구현 후 관련 테스트를 실행한다.

실패하면 원인을 분석하고 구현을 수정한다.

테스트를 삭제하거나 assertion을 약화해 통과시키지 않는다.

---

## Retrieval

검색 구현 변경 시 반드시 retrieval evaluation을 다시 수행한다.

검색 품질이 기존보다 하락하면 변경을 완료로 처리하지 않는다.

---

## Dependency

새 라이브러리를 추가하기 전에 기존 dependency로 해결 가능한지 확인한다.

불필요한 framework 또는 abstraction을 추가하지 않는다.

---

## Refactoring

현재 요구사항을 구현하는 데 필요한 범위만 refactoring한다.

대규모 구조 변경은 피한다.

---

## Completion

"코드 작성 완료"를 작업 완료로 간주하지 않는다.

아래가 모두 충족되어야 한다.

Build
+
Test
+
Evaluation
+
Privacy Check

그 후에만 작업을 완료 처리한다.
