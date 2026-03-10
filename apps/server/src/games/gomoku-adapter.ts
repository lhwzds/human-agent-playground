import {
  createInitialGomokuGame,
  gomokuGameCatalogItem,
  gomokuGameStateSchema,
  gomokuPointSchema,
  listLegalMoves,
  playGomokuMove,
  playGomokuMoveInputSchema,
} from '@human-agent-playground/game-gomoku'

import type { GameAdapter } from '../game-registry.js'

function parsePointQuery(query: unknown) {
  if (query === undefined || query === null) {
    return undefined
  }

  if (typeof query === 'string') {
    return gomokuPointSchema.parse(query)
  }

  if (typeof query !== 'object') {
    throw new Error('Invalid legal move query payload')
  }

  const pointValue = (query as { point?: unknown }).point
  if (pointValue === undefined || pointValue === null) {
    return undefined
  }

  if (Array.isArray(pointValue)) {
    return gomokuPointSchema.parse(pointValue[0])
  }

  return gomokuPointSchema.parse(pointValue)
}

export const gomokuGameAdapter: GameAdapter = {
  game: gomokuGameCatalogItem,

  createInitialState() {
    return createInitialGomokuGame()
  },

  normalizeState(state) {
    return gomokuGameStateSchema.parse(state)
  },

  listLegalMoves(state, query) {
    const parsedState = gomokuGameStateSchema.parse(state)
    const point = parsePointQuery(query)
    return listLegalMoves(parsedState, point)
  },

  playMove(state, input) {
    const parsedState = gomokuGameStateSchema.parse(state)
    const parsedInput = playGomokuMoveInputSchema.parse(input)
    return playGomokuMove(parsedState, parsedInput.point)
  },
}
