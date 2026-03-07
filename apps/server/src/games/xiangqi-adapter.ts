import {
  createInitialXiangqiGame,
  listLegalMoves,
  playMoveInputSchema,
  playXiangqiMove,
  squareSchema,
  xiangqiGameCatalogItem,
  xiangqiGameStateSchema,
} from '@human-agent-playground/game-xiangqi'

import type { GameAdapter } from '../game-registry.js'

function parseFromQuery(query: unknown) {
  if (query === undefined || query === null) {
    return undefined
  }

  if (typeof query === 'string') {
    return squareSchema.parse(query)
  }

  if (typeof query !== 'object') {
    throw new Error('Invalid legal move query payload')
  }

  const fromValue = (query as { from?: unknown }).from
  if (fromValue === undefined || fromValue === null) {
    return undefined
  }

  if (Array.isArray(fromValue)) {
    return squareSchema.parse(fromValue[0])
  }

  return squareSchema.parse(fromValue)
}

export const xiangqiGameAdapter: GameAdapter = {
  game: xiangqiGameCatalogItem,

  createInitialState() {
    return createInitialXiangqiGame()
  },

  normalizeState(state) {
    return xiangqiGameStateSchema.parse(state)
  },

  listLegalMoves(state, query) {
    const parsedState = xiangqiGameStateSchema.parse(state)
    const from = parseFromQuery(query)
    return listLegalMoves(parsedState, from)
  },

  playMove(state, input) {
    const parsedState = xiangqiGameStateSchema.parse(state)
    const parsedInput = playMoveInputSchema.parse(input)
    return playXiangqiMove(parsedState, parsedInput.from, parsedInput.to)
  },
}
