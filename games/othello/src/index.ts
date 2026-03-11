export * from './types'
export * from './othello'

import type { GameCatalogItem } from '@human-agent-playground/core'

export const othelloGameCatalogItem: GameCatalogItem = {
  id: 'othello',
  title: 'Othello',
  shortName: 'Othello',
  description:
    'An 8x8 disk-flipping game where black and white bracket opposing discs and control the final board count.',
}
