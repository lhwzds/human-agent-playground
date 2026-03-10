export * from './types'
export * from './gomoku'

import type { GameCatalogItem } from '@human-agent-playground/core'

export const gomokuGameCatalogItem: GameCatalogItem = {
  id: 'gomoku',
  title: 'Gomoku',
  shortName: 'Gomoku',
  description:
    'A 15x15 connection game where black and white alternate placing stones and race to make five in a row.',
}
