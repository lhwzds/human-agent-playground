import * as z from 'zod/v4'

import type { GameSession } from '@human-agent-playground/core'

import type { GameService } from '../game-service.js'
import {
  listToolCategories,
  searchToolCatalog,
  textResult,
  type ToolCatalogEntry,
} from './tool-catalog.js'

export function createPlatformToolCatalog(
  service: GameService,
  getAllTools: () => ToolCatalogEntry[],
): ToolCatalogEntry[] {
  return [
    {
      name: 'list_games',
      title: 'List Games',
      description: 'List the game adapters currently exposed by the playground server.',
      category: 'catalog',
      tags: ['platform', 'games', 'discovery'],
      annotations: {
        title: 'List Games',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const response = await service.listGames()
        return textResult('Available games', { games: response })
      },
    },
    {
      name: 'list_sessions',
      title: 'List Sessions',
      description:
        'List active playground sessions. Use this to discover shared human-agent matches and their game ids.',
      category: 'catalog',
      tags: ['platform', 'sessions', 'discovery'],
      annotations: {
        title: 'List Sessions',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async () => {
        const response: { sessions: GameSession[] } = {
          sessions: await service.listSessions(),
        }
        return textResult('Active sessions', response)
      },
    },
    {
      name: 'search_tools',
      title: 'Search Tools',
      description:
        'Search the playground MCP tool catalog by query, category, game id, or tags. Use this when the server exposes many tools.',
      category: 'catalog',
      tags: ['platform', 'tools', 'search', 'discovery'],
      inputSchema: {
        query: z.string().optional().describe('Optional free-text query matched against tool names and descriptions'),
        category: z.string().optional().describe('Optional category filter such as catalog, session, or gameplay'),
        gameId: z.string().optional().describe('Optional game id filter such as xiangqi'),
        tags: z.array(z.string()).optional().describe('Optional tag filter'),
        limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of results'),
      },
      annotations: {
        title: 'Search Tools',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const parsed = z
          .object({
            query: z.string().optional(),
            category: z.string().optional(),
            gameId: z.string().optional(),
            tags: z.array(z.string()).optional(),
            limit: z.number().int().min(1).max(50).default(10),
          })
          .parse(input ?? {})

        const tools = getAllTools()
        return textResult('Matching tools', {
          categories: listToolCategories(tools),
          tools: searchToolCatalog(tools, parsed),
        })
      },
    },
    {
      name: 'create_session',
      title: 'Create Session',
      description: 'Create a new shared session for one game.',
      category: 'session',
      tags: ['platform', 'sessions', 'create'],
      inputSchema: {
        gameId: z.string().default('xiangqi').describe('Game id such as xiangqi'),
      },
      annotations: {
        title: 'Create Session',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { gameId } = z.object({ gameId: z.string().default('xiangqi') }).parse(input ?? {})
        const session = await service.createSession({ gameId })
        return textResult('Created session', session)
      },
    },
    {
      name: 'get_game_state',
      title: 'Get Game State',
      description: 'Get the current board, turn, move history summary, winner, and status for a session.',
      category: 'session',
      tags: ['platform', 'sessions', 'state', 'read'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The session id returned by list_sessions or create_session'),
      },
      annotations: {
        title: 'Get Game State',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(input)
        const session = await service.getSession(sessionId)
        return textResult('Current game state', session)
      },
    },
    {
      name: 'reset_session',
      title: 'Reset Session',
      description: 'Reset a session back to that game’s default opening position.',
      category: 'session',
      tags: ['platform', 'sessions', 'reset'],
      inputSchema: {
        sessionId: z.string().uuid().describe('The session id to reset'),
      },
      annotations: {
        title: 'Reset Session',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (input) => {
        const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(input)
        const session = await service.resetSession(sessionId)
        return textResult('Reset session', session)
      },
    },
  ]
}
