#!/bin/bash

set -e

echo "Checking forbidden AI SDK usage..."

PATTERN='openai|anthropic|@google/generative-ai|google-generativeai|cohere|voyageai'

# 대화형 입력 예외 (ARCHITECTURE.md 2번): Anthropic/Claude 는 이 파일 안에서만 허용한다.
# 정확한 경로 하나만 예외 처리한다 — 파일명 패턴이나 디렉터리 단위로 넓히지 않는다.
ALLOWED='^\./backend/chat\.mjs:'

HITS=$(grep -RniE "$PATTERN" \
  ./backend ./frontend ./embedding ./embedding-py ./src \
  --exclude-dir=node_modules \
  --exclude-dir=.venv \
  --exclude-dir=.git \
  --exclude-dir=build \
  --exclude-dir=dist \
  --exclude-dir=target 2>/dev/null | grep -vE "$ALLOWED" || true)

if [ -n "$HITS" ]; then
  echo "$HITS"
  echo ""
  echo "❌ Privacy check failed"
  echo "External AI dependency detected."
  echo "(대화형 입력 예외는 backend/chat.mjs 안에서만 허용된다 — ARCHITECTURE.md 2번)"
  exit 1
fi

echo "✅ Privacy check passed"
