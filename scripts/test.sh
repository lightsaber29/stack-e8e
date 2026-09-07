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
node --check backend/vault-sync.mjs
node --check backend/sources.mjs
node --check scripts/sync-vault.mjs
node --check scripts/import-sources.mjs
node --check embedding/index.mjs

echo "=== Embedding service (Python) syntax check ==="
# venv 경로는 OS마다 다르다: Windows=Scripts/python.exe, mac/Linux=bin/python
if [ -x ./embedding-py/.venv/Scripts/python.exe ]; then
  PY=./embedding-py/.venv/Scripts/python.exe
elif [ -x ./embedding-py/.venv/bin/python ]; then
  PY=./embedding-py/.venv/bin/python
else
  echo "❌ embedding-py/.venv 를 찾을 수 없다 (SETUP.md 4번 참고)" >&2
  exit 1
fi
"$PY" -m py_compile embedding-py/service.py

echo "=== Frontend build (root Vite app) ==="
npm run build

echo "✅ test.sh passed"
