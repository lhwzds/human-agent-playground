import type { GameCatalogItem } from '@human-agent-playground/core'

import { chessGameAdapter } from './games/chess-adapter.js'
import { connectFourGameAdapter } from './games/connect-four-adapter.js'
import { gomokuGameAdapter } from './games/gomoku-adapter.js'
import { othelloGameAdapter } from './games/othello-adapter.js'
import { xiangqiGameAdapter } from './games/xiangqi-adapter.js'

export interface GameAdapter {
  game: GameCatalogItem
  createInitialState(): unknown
  normalizeState(state: unknown): unknown
  listLegalMoves(state: unknown, query?: unknown): unknown[]
  playMove(state: unknown, input: unknown): unknown
}

const adapters: GameAdapter[] = [
  xiangqiGameAdapter,
  chessGameAdapter,
  gomokuGameAdapter,
  connectFourGameAdapter,
  othelloGameAdapter,
]

const adapterById = new Map(adapters.map((adapter) => [adapter.game.id, adapter]))

export function listGameCatalog(): GameCatalogItem[] {
  return adapters.map((adapter) => adapter.game)
}

export function getGameAdapter(gameId: string): GameAdapter {
  const adapter = adapterById.get(gameId)
  if (!adapter) {
    throw new Error(`Unsupported game: ${gameId}`)
  }

  return adapter
}
