#!/bin/bash
#
# Build + smoke test 하네스.
# 이 환경의 실제 스택(경량 Node): DECISIONS.md 참고.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Backend / Embedding syntax check ==="
node --check backend/server.mjs
node --check backend/store.mjs
node --check backend/obsidian.mjs
node --check embedding/index.mjs

echo "=== Embedding service (Python) syntax check ==="
./embedding-py/.venv/Scripts/python.exe -m py_compile embedding-py/service.py

echo "=== Frontend build (root Vite app) ==="
npm run build

echo "✅ test.sh passed"
