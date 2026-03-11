export * from './types'
export * from './connect-four'

import type { GameCatalogItem } from '@human-agent-playground/core'

export const connectFourGameCatalogItem: GameCatalogItem = {
  id: 'connect-four',
  title: 'Connect Four',
  shortName: 'Connect Four',
  description:
    'A vertical 7x6 connection game where red and yellow drop discs into columns and race to connect four.',
}
