import { z } from 'zod'

export const createSessionInputSchema = z.object({
  gameId: z.string().min(1).default('xiangqi'),
  mode: z.enum(['human-vs-agent', 'agent-vs-agent', 'human-vs-human']).default('human-vs-agent'),
})
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>

export const sessionModeSchema = createSessionInputSchema.shape.mode
export type SessionMode = z.infer<typeof sessionModeSchema>

export const sessionStatusSchema = z.enum(['active', 'finished'])
export type SessionStatus = z.infer<typeof sessionStatusSchema>

export const gameCatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().min(1),
  supportsHumanVsHuman: z.boolean(),
  supportsHumanVsAgent: z.boolean(),
  supportsAgentVsAgent: z.boolean(),
})
export type GameCatalogItem = z.infer<typeof gameCatalogItemSchema>

export interface GameSession<TState = unknown> {
  id: string
  gameId: string
  mode: SessionMode
  createdAt: string
  updatedAt: string
  state: TState
}
