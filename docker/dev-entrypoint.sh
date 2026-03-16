#!/usr/bin/env bash

set -euo pipefail

cleanup() {
  if [[ -n "${WATCHER_PIDS:-}" ]]; then
    kill ${WATCHER_PIDS} 2>/dev/null || true
  fi

  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Human Agent Playground Docker dev environment"
echo "  API port: ${PORT}"
echo "  Data path: ${HUMAN_AGENT_PLAYGROUND_DATA_PATH}"
echo "  Web port: 4178"
echo "  VITE_API_URL: ${VITE_API_URL}"
echo "  VITE_API_PORT: ${VITE_API_PORT:-8790}"

npm --prefix packages/core run build
npm --prefix games/xiangqi run build
npm --prefix games/gomoku run build
npm --prefix games/connect-four run build
npm --prefix games/othello run build
npm --prefix games/chess run build

npm --prefix packages/core run build -- --watch --preserveWatchOutput &
WATCHER_CORE_PID=$!
npm --prefix games/xiangqi run build -- --watch --preserveWatchOutput &
WATCHER_XIANGQI_PID=$!
npm --prefix games/gomoku run build -- --watch --preserveWatchOutput &
WATCHER_GOMOKU_PID=$!
npm --prefix games/connect-four run build -- --watch --preserveWatchOutput &
WATCHER_CONNECT_FOUR_PID=$!
npm --prefix games/othello run build -- --watch --preserveWatchOutput &
WATCHER_OTHELLO_PID=$!
npm --prefix games/chess run build -- --watch --preserveWatchOutput &
WATCHER_CHESS_PID=$!

WATCHER_PIDS="${WATCHER_CORE_PID} ${WATCHER_XIANGQI_PID} ${WATCHER_GOMOKU_PID} ${WATCHER_CONNECT_FOUR_PID} ${WATCHER_OTHELLO_PID} ${WATCHER_CHESS_PID}"

PORT="${PORT}" HUMAN_AGENT_PLAYGROUND_DATA_PATH="${HUMAN_AGENT_PLAYGROUND_DATA_PATH}" HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_URL="${HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_URL:-http://ai-bridge:8795}" npm --prefix apps/server run dev &
SERVER_PID=$!

VITE_API_URL="${VITE_API_URL}" VITE_API_PORT="${VITE_API_PORT:-8790}" npm --prefix apps/web run dev -- --host 0.0.0.0 --port 4178 --strictPort &
WEB_PID=$!

wait -n "${SERVER_PID}" "${WEB_PID}" "${WATCHER_CORE_PID}" "${WATCHER_XIANGQI_PID}" "${WATCHER_GOMOKU_PID}" "${WATCHER_CONNECT_FOUR_PID}" "${WATCHER_OTHELLO_PID}" "${WATCHER_CHESS_PID}"
