#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8790}"
WEB_PORT="${WEB_PORT:-4178}"
DATA_PATH="${HUMAN_AGENT_PLAYGROUND_DATA_PATH:-/tmp/human-agent-playground-demo-sessions.json}"
API_URL="${VITE_API_URL:-http://127.0.0.1:${API_PORT}}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Human Agent Playground"
echo "  API port: ${API_PORT}"
echo "  Web port: ${WEB_PORT}"
echo "  Data path: ${DATA_PATH}"
echo "  MCP endpoint: ${API_URL}/mcp"

(
  cd "${ROOT_DIR}"
  PORT="${API_PORT}" \
  HUMAN_AGENT_PLAYGROUND_DATA_PATH="${DATA_PATH}" \
  npm --prefix apps/server run start
) &
SERVER_PID=$!

(
  cd "${ROOT_DIR}"
  VITE_API_URL="${API_URL}" \
  npm --prefix apps/web run start -- --port "${WEB_PORT}"
) &
WEB_PID=$!

wait "${SERVER_PID}" "${WEB_PID}"
