#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8790}"
WEB_PORT="${WEB_PORT:-4178}"
AI_BRIDGE_PORT="${AI_BRIDGE_PORT:-8795}"
DATA_PATH="${HUMAN_AGENT_PLAYGROUND_DATA_PATH:-/tmp/human-agent-playground-demo-sessions.json}"
AI_BRIDGE_DATA_PATH="${HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_DATA_PATH:-/tmp/human-agent-playground-ai-bridge/restflow.db}"
API_URL="${VITE_API_URL:-}"
API_PORT_FOR_WEB="${VITE_API_PORT:-${API_PORT}}"
AI_BRIDGE_URL="${HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_URL:-http://127.0.0.1:${AI_BRIDGE_PORT}}"

cleanup() {
  if [[ -n "${AI_BRIDGE_PID:-}" ]]; then
    kill "${AI_BRIDGE_PID}" 2>/dev/null || true
  fi

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
echo "  AI bridge port: ${AI_BRIDGE_PORT}"
echo "  Data path: ${DATA_PATH}"
echo "  AI bridge data path: ${AI_BRIDGE_DATA_PATH}"
if [[ -n "${API_URL}" ]]; then
  echo "  API URL override: ${API_URL}"
fi
echo "  API port for web: ${API_PORT_FOR_WEB}"
echo "  MCP endpoint: http://127.0.0.1:${API_PORT}/mcp"
echo "  AI bridge endpoint: ${AI_BRIDGE_URL}"

(
  cd "${ROOT_DIR}"
  PORT="${AI_BRIDGE_PORT}" \
  HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_DATA_PATH="${AI_BRIDGE_DATA_PATH}" \
  cargo run --manifest-path apps/ai-bridge/Cargo.toml
) &
AI_BRIDGE_PID=$!

(
  cd "${ROOT_DIR}"
  PORT="${API_PORT}" \
  HUMAN_AGENT_PLAYGROUND_DATA_PATH="${DATA_PATH}" \
  HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_URL="${AI_BRIDGE_URL}" \
  npm --prefix apps/server run start
) &
SERVER_PID=$!

(
  cd "${ROOT_DIR}"
  VITE_API_URL="${API_URL}" \
  VITE_API_PORT="${API_PORT_FOR_WEB}" \
  npm --prefix apps/web run start -- --host 0.0.0.0 --port "${WEB_PORT}"
) &
WEB_PID=$!

wait "${AI_BRIDGE_PID}" "${SERVER_PID}" "${WEB_PID}"
