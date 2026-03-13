import {
  chessGameCatalogItem,
  chessGameStateSchema,
  chessSquareSchema,
  createInitialChessGame,
  listLegalMoves,
  playChessMove,
  playChessMoveInputSchema,
} from '@human-agent-playground/game-chess'

import type { GameAdapter } from '../game-registry.js'

function parseSquareQuery(query: unknown) {
  if (query === undefined || query === null) {
    return undefined
  }

  if (typeof query === 'string') {
    return chessSquareSchema.parse(query)
  }

  if (typeof query !== 'object') {
    throw new Error('Invalid legal move query payload')
  }

  const fromValue = (query as { from?: unknown }).from
  if (fromValue === undefined || fromValue === null) {
    return undefined
  }

  if (Array.isArray(fromValue)) {
    return chessSquareSchema.parse(fromValue[0])
  }

  return chessSquareSchema.parse(fromValue)
}

export const chessGameAdapter: GameAdapter = {
  game: chessGameCatalogItem,

  createInitialState() {
    return createInitialChessGame()
  },

  normalizeState(state) {
    return chessGameStateSchema.parse(state)
  },

  listLegalMoves(state, query) {
    const parsedState = chessGameStateSchema.parse(state)
    const from = parseSquareQuery(query)
    return listLegalMoves(parsedState, from)
  },

  playMove(state, input) {
    const parsedState = chessGameStateSchema.parse(state)
    const parsedInput = playChessMoveInputSchema.parse(input)
    return playChessMove(parsedState, parsedInput.from, parsedInput.to, parsedInput.promotion)
  },
}
