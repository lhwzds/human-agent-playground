export * from './types'
export * from './chess'

import type { GameCatalogItem } from '@human-agent-playground/core'

export const chessGameCatalogItem: GameCatalogItem = {
  id: 'chess',
  title: 'Chess',
  shortName: 'Chess',
  description:
    'An 8x8 royal strategy game where white and black maneuver pieces, deliver checkmate, and fight for the center.',
}
