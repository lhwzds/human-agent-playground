import { z } from 'zod'

export const sessionStatusSchema = z.enum(['active', 'finished'])
export type SessionStatus = z.infer<typeof sessionStatusSchema>

export const aiSeatStatusSchema = z.enum(['idle', 'thinking', 'waiting', 'errored'])
export type AiSeatStatus = z.infer<typeof aiSeatStatusSchema>

export const aiRuntimeProviderIdSchema = z.enum([
  'openai',
  'anthropic',
  'codex',
  'claude_code',
  'gemini',
])
export type AiRuntimeProviderId = z.infer<typeof aiRuntimeProviderIdSchema>

export const aiLauncherIdSchema = z.enum([
  'human',
  'openai',
  'anthropic',
  'codex',
  'claude_code',
  'gemini',
])
export type AiLauncherId = z.infer<typeof aiLauncherIdSchema>

export const createSessionSeatLauncherInputSchema = z.object({
  launcher: aiLauncherIdSchema.default('human'),
  model: z.string().min(1).optional(),
  autoPlay: z.boolean().optional(),
})
export type CreateSessionSeatLauncherInput = z.infer<
  typeof createSessionSeatLauncherInputSchema
>

export const createSessionInputSchema = z.object({
  gameId: z.string().min(1).default('xiangqi'),
  actorKind: z.enum(['human', 'agent', 'system', 'unknown']).optional(),
  channel: z.enum(['ui', 'mcp', 'http', 'system']).optional(),
  actorName: z.string().min(1).optional(),
  seatLaunchers: z
    .record(z.string().min(1), createSessionSeatLauncherInputSchema)
    .optional(),
})
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>

export const gameCatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().min(1),
  sides: z.array(z.string().min(1)).min(2),
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

export const authProfileSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  source: z.string().min(1),
  health: z.string().min(1),
  enabled: z.boolean(),
  credentialType: z.string().min(1),
  maskedValue: z.string().nullable().default(null),
})
export type AuthProfileSummary = z.infer<typeof authProfileSummarySchema>

export const providerModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.string().min(1),
  supportsTemperature: z.boolean().default(false),
})
export type ProviderModel = z.infer<typeof providerModelSchema>

export const providerCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['api', 'cli']),
  available: z.boolean(),
  status: z.string().min(1),
  models: z.array(providerModelSchema).default([]),
  authProviders: z.array(z.string().min(1)).default([]),
})
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>

export const aiSeatConfigSchema = z.object({
  side: z.string().min(1),
  launcher: aiLauncherIdSchema.default('human'),
  enabled: z.boolean().default(false),
  autoPlay: z.boolean().default(true),
  providerProfileId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  promptOverride: z.string().trim().min(1).nullable().optional(),
  timeoutMs: z.number().int().min(1000).max(600000).default(60000),
  status: aiSeatStatusSchema.default('idle'),
  lastError: z.string().min(1).nullable().optional(),
  runtimeSource: z.string().min(1).nullable().optional(),
})
export type AiSeatConfig = z.infer<typeof aiSeatConfigSchema>

export const updateAiSeatInputSchema = aiSeatConfigSchema
  .pick({
    launcher: true,
    enabled: true,
    autoPlay: true,
    providerProfileId: true,
    model: true,
    promptOverride: true,
    timeoutMs: true,
  })
  .partial()
export type UpdateAiSeatInput = z.infer<typeof updateAiSeatInputSchema>

export const aiRuntimeProviderSettingSchema = z.object({
  providerId: aiRuntimeProviderIdSchema,
  displayName: z.string().trim().min(1).nullable().default(null),
  defaultModel: z.string().min(1).nullable().default(null),
  defaultProfileId: z.string().min(1).nullable().default(null),
  preferredSource: z.enum(['api', 'cli']).nullable().default(null),
})
export type AiRuntimeProviderSetting = z.infer<typeof aiRuntimeProviderSettingSchema>

export const aiRuntimeSettingsSchema = z.object({
  providers: z.array(aiRuntimeProviderSettingSchema).default([]),
})
export type AiRuntimeSettings = z.infer<typeof aiRuntimeSettingsSchema>

export const aiSeatLauncherStateSchema = z.object({
  side: z.string().min(1),
  launcher: aiLauncherIdSchema.default('human'),
  model: z.string().min(1).nullable().default(null),
  enabled: z.boolean().default(false),
  autoPlay: z.boolean().default(true),
  status: aiSeatStatusSchema.default('idle'),
  lastError: z.string().min(1).nullable().default(null),
  runtimeSource: z.string().min(1).nullable().default(null),
})
export type AiSeatLauncherState = z.infer<typeof aiSeatLauncherStateSchema>

export const updateAiSeatLauncherInputSchema = z.object({
  launcher: aiLauncherIdSchema,
  model: z.string().min(1).optional(),
  autoPlay: z.boolean().optional(),
  advanced: z
    .object({
      providerProfileId: z.string().min(1).optional(),
      promptOverride: z.string().trim().min(1).nullable().optional(),
      timeoutMs: z.number().int().min(1000).max(600000).optional(),
    })
    .partial()
    .optional(),
})
export type UpdateAiSeatLauncherInput = z.infer<typeof updateAiSeatLauncherInputSchema>

export const updateAiSeatLaunchersInputSchema = z.record(
  z.string().min(1),
  updateAiSeatLauncherInputSchema,
)
export type UpdateAiSeatLaunchersInput = z.infer<typeof updateAiSeatLaunchersInputSchema>

export const createAuthProfileInputSchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  credentialType: z.enum(['api_key', 'token']),
  credentialValue: z.string().min(1),
  email: z.string().email().optional(),
})
export type CreateAuthProfileInput = z.infer<typeof createAuthProfileInputSchema>

export const updateAuthProfileInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().optional(),
    credentialType: z.enum(['api_key', 'token']).optional(),
    credentialValue: z.string().min(1).optional(),
    email: z.string().email().nullable().optional(),
  })
  .partial()
export type UpdateAuthProfileInput = z.infer<typeof updateAuthProfileInputSchema>

export const sessionEventKindSchema = z.enum([
  'session_created',
  'move_played',
  'session_reset',
  'system_notice',
])
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
  aiSeats?: Record<string, AiSeatConfig>
}

export interface SessionStreamEvent<TState = unknown> {
  session: GameSession<TState>
}
