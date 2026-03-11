import { connectFourGameModule } from './games/connect-four'
import { gomokuGameModule } from './games/gomoku'
import { othelloGameModule } from './games/othello'
import { xiangqiGameModule } from './games/xiangqi'
import type { GameModule } from './games/types'

const gameModules: GameModule[] = [
  xiangqiGameModule,
  gomokuGameModule,
  connectFourGameModule,
  othelloGameModule,
]

const gameModuleById = new Map(gameModules.map((module) => [module.gameId, module]))

export function getGameModule(gameId: string): GameModule {
  const gameModule = gameModuleById.get(gameId)
  if (!gameModule) {
    throw new Error(`No game module registered for ${gameId}`)
  }

  return gameModule
}
