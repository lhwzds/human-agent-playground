import { z } from 'zod'

export const createSessionInputSchema = z.object({
  gameId: z.string().min(1).default('xiangqi'),
  actorKind: z.enum(['human', 'agent', 'system', 'unknown']).optional(),
  channel: z.enum(['ui', 'mcp', 'http', 'system']).optional(),
  actorName: z.string().min(1).optional(),
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

export const decisionAlternativeSchema = z.object({
  action: z.string().min(1),
  summary: z.string().min(1),
  rejectedBecause: z.string().min(1).optional(),
})
export type DecisionAlternative = z.infer<typeof decisionAlternativeSchema>

export const decisionExplanationSchema = z.object({
  summary: z.string().min(1),
  reasoningSteps: z.array(z.string().min(1)).default([]),
  consideredAlternatives: z.array(decisionAlternativeSchema).default([]),
  confidence: z.number().min(0).max(1).nullable().optional(),
})
export type DecisionExplanation = z.infer<typeof decisionExplanationSchema>

export const sessionEventKindSchema = z.enum(['session_created', 'move_played', 'session_reset'])
export type SessionEventKind = z.infer<typeof sessionEventKindSchema>

export const sessionEventSchema = z.object({
  id: z.string().min(1),
  kind: sessionEventKindSchema,
  createdAt: z.string().min(1),
  actorKind: z.enum(['human', 'agent', 'system', 'unknown']),
  channel: z.enum(['ui', 'mcp', 'http', 'system']),
  actorName: z.string().min(1).optional(),
  summary: z.string().min(1),
  reasoning: decisionExplanationSchema.optional(),
  details: z.record(z.string(), z.unknown()).default({}),
})
export type SessionEvent = z.infer<typeof sessionEventSchema>

export interface GameSession<TState = unknown> {
  id: string
  gameId: string
  createdAt: string
  updatedAt: string
  state: TState
  events: SessionEvent[]
}

export interface SessionStreamEvent<TState = unknown> {
  session: GameSession<TState>
}
