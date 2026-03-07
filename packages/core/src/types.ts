import { z } from 'zod'

export const createSessionInputSchema = z.object({
  gameId: z.string().min(1).default('xiangqi'),
})
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>

export const sessionStatusSchema = z.enum(['active', 'finished'])
export type SessionStatus = z.infer<typeof sessionStatusSchema>

export const gameCatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().min(1),
})
export type GameCatalogItem = z.infer<typeof gameCatalogItemSchema>

export interface GameSession<TState = unknown> {
  id: string
  gameId: string
  createdAt: string
  updatedAt: string
  state: TState
}

export interface SessionStreamEvent<TState = unknown> {
  session: GameSession<TState>
}
