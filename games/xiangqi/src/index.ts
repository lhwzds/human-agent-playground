export * from './types'
export * from './xiangqi'

import type { GameCatalogItem } from '@human-agent-playground/core'

export const xiangqiGameCatalogItem: GameCatalogItem = {
  id: 'xiangqi',
  title: 'Chinese Chess',
  shortName: 'Xiangqi',
  description:
    'A 9x10 perfect-information board game with palace, river, cannon, and horse-leg rules.',
}
