#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-8790}"
WEB_PORT="${WEB_PORT:-4178}"
DATA_PATH="${HUMAN_AGENT_PLAYGROUND_DATA_PATH:-/tmp/human-agent-playground-demo-sessions.json}"
AUTH_DATA_PATH="${HUMAN_AGENT_PLAYGROUND_AUTH_DATA_PATH:-${HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_DATA_PATH:-/tmp/human-agent-playground-auth/restflow.db}}"
API_URL="${VITE_API_URL:-}"
API_PORT_FOR_WEB="${VITE_API_PORT:-${API_PORT}}"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Human Agent Playground"
echo "  Backend port: ${API_PORT}"
echo "  Web port: ${WEB_PORT}"
echo "  Data path: ${DATA_PATH}"
echo "  Auth/profile data path: ${AUTH_DATA_PATH}"
if [[ -n "${API_URL}" ]]; then
  echo "  API URL override: ${API_URL}"
fi
echo "  API port for web: ${API_PORT_FOR_WEB}"
echo "  API endpoint: http://127.0.0.1:${API_PORT}/api"

(
  cd "${ROOT_DIR}"
  PORT="${API_PORT}" \
  HUMAN_AGENT_PLAYGROUND_DATA_PATH="${DATA_PATH}" \
  HUMAN_AGENT_PLAYGROUND_AUTH_DATA_PATH="${AUTH_DATA_PATH}" \
  cargo run -p human-agent-playground-backend
) &
BACKEND_PID=$!

(
  cd "${ROOT_DIR}"
  VITE_API_URL="${API_URL}" \
  VITE_API_PORT="${API_PORT_FOR_WEB}" \
  npm --prefix apps/web run start -- --host 0.0.0.0 --port "${WEB_PORT}"
) &
WEB_PID=$!

wait "${BACKEND_PID}" "${WEB_PID}"
