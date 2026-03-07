import { xiangqiGameModule } from './games/xiangqi'
import type { GameModule } from './games/types'

const gameModules: GameModule[] = [xiangqiGameModule]

const gameModuleById = new Map(gameModules.map((module) => [module.gameId, module]))

export function getGameModule(gameId: string): GameModule {
  const gameModule = gameModuleById.get(gameId)
  if (!gameModule) {
    throw new Error(`No game module registered for ${gameId}`)
  }

  return gameModule
}
