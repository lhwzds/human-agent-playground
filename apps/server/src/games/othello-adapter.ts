import {
  createInitialOthelloGame,
  listLegalMoves,
  othelloGameCatalogItem,
  othelloGameStateSchema,
  othelloPointSchema,
  playOthelloMove,
  playOthelloMoveInputSchema,
} from '@human-agent-playground/game-othello'

import type { GameAdapter } from '../game-registry.js'

function parsePointQuery(query: unknown) {
  if (query === undefined || query === null) {
    return undefined
  }

  if (typeof query === 'string') {
    return othelloPointSchema.parse(query)
  }

  if (typeof query !== 'object') {
    throw new Error('Invalid legal move query payload')
  }

  const pointValue = (query as { point?: unknown }).point
  if (pointValue === undefined || pointValue === null) {
    return undefined
  }

  if (Array.isArray(pointValue)) {
    return othelloPointSchema.parse(pointValue[0])
  }

  return othelloPointSchema.parse(pointValue)
}

export const othelloGameAdapter: GameAdapter = {
  game: othelloGameCatalogItem,

  createInitialState() {
    return createInitialOthelloGame()
  },

  normalizeState(state) {
    return othelloGameStateSchema.parse(state)
  },

  listLegalMoves(state, query) {
    const parsedState = othelloGameStateSchema.parse(state)
    const point = parsePointQuery(query)
    return listLegalMoves(parsedState, point)
  },

  playMove(state, input) {
    const parsedState = othelloGameStateSchema.parse(state)
    const parsedInput = playOthelloMoveInputSchema.parse(input)
    return playOthelloMove(parsedState, parsedInput.point)
  },
}
