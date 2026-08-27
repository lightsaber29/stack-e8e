#!/bin/bash
#
# 전체 하네스 실행:
#   1) Privacy Check
#   2) Build + Test
#   3) Retrieval Evaluation (eval/run-retrieval.mjs, RETRIEVAL_EVAL_CMD로 오버라이드 가능)

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "########## 1. Privacy Check ##########"
bash "$ROOT/scripts/privacy-check.sh"

echo ""
echo "########## 2. Build + Test ##########"
bash "$ROOT/scripts/test.sh"

echo ""
echo "########## 3. Retrieval Evaluation ##########"
RETRIEVAL_EVAL_CMD="${RETRIEVAL_EVAL_CMD:-node $ROOT/eval/run-retrieval.mjs}"
eval "$RETRIEVAL_EVAL_CMD"

echo ""
echo "✅ eval.sh completed"
