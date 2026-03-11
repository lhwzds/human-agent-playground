import {
  connectFourColumnSchema,
  connectFourGameCatalogItem,
  connectFourGameStateSchema,
  createInitialConnectFourGame,
  listLegalMoves,
  playConnectFourMove,
  playConnectFourMoveInputSchema,
} from '@human-agent-playground/game-connect-four'

import type { GameAdapter } from '../game-registry.js'

function parseColumnQuery(query: unknown) {
  if (query === undefined || query === null) {
    return undefined
  }

  if (typeof query === 'number') {
    return connectFourColumnSchema.parse(query)
  }

  if (typeof query === 'string') {
    return connectFourColumnSchema.parse(Number(query))
  }

  if (typeof query !== 'object') {
    throw new Error('Invalid legal move query payload')
  }

  const columnValue = (query as { column?: unknown }).column
  if (columnValue === undefined || columnValue === null) {
    return undefined
  }

  if (Array.isArray(columnValue)) {
    return connectFourColumnSchema.parse(Number(columnValue[0]))
  }

  return connectFourColumnSchema.parse(Number(columnValue))
}

export const connectFourGameAdapter: GameAdapter = {
  game: connectFourGameCatalogItem,

  createInitialState() {
    return createInitialConnectFourGame()
  },

  normalizeState(state) {
    return connectFourGameStateSchema.parse(state)
  },

  listLegalMoves(state, query) {
    const parsedState = connectFourGameStateSchema.parse(state)
    const column = parseColumnQuery(query)
    return listLegalMoves(parsedState, column)
  },

  playMove(state, input) {
    const parsedState = connectFourGameStateSchema.parse(state)
    const parsedInput = playConnectFourMoveInputSchema.parse(input)
    return playConnectFourMove(parsedState, parsedInput.column)
  },
}
