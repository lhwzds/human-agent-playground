import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'

import type { GameSession } from '@human-agent-playground/core'

import type { GameService } from '../game-service.js'

function textResult(title: string, payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${title}\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    structuredContent: {
      payload,
    },
  }
}

export function registerPlatformTools(server: McpServer, service: GameService) {
  server.registerTool(
    'list_games',
    {
      description: 'List the game adapters currently exposed by the playground server.',
    },
    async () => {
      const response = await service.listGames()
      return textResult('Available games', { games: response })
    },
  )

  server.registerTool(
    'list_sessions',
    {
      description:
        'List active playground sessions. Use this to discover shared human-agent matches and their game ids.',
    },
    async () => {
      const response: { sessions: GameSession[] } = {
        sessions: await service.listSessions(),
      }
      return textResult('Active sessions', response)
    },
  )

  server.registerTool(
    'create_session',
    {
      description:
        'Create a new session for one game and one mode. Modes support human-vs-agent, agent-vs-agent, and human-vs-human.',
      inputSchema: {
        gameId: z.string().default('xiangqi').describe('Game id such as xiangqi'),
        mode: z
          .enum(['human-vs-agent', 'agent-vs-agent', 'human-vs-human'])
          .default('human-vs-agent')
          .describe('Session mode for the new match'),
      },
    },
    async ({ gameId, mode }) => {
      const session = await service.createSession({ gameId, mode })
      return textResult('Created session', session)
    },
  )

  server.registerTool(
    'get_game_state',
    {
      description:
        'Get the current board, turn, mode, move history summary, winner, and status for a session.',
      inputSchema: {
        sessionId: z.string().uuid().describe('The session id returned by list_sessions or create_session'),
      },
    },
    async ({ sessionId }) => {
      const session = await service.getSession(sessionId)
      return textResult('Current game state', session)
    },
  )

  server.registerTool(
    'reset_session',
    {
      description: 'Reset a session back to that game’s default opening position.',
      inputSchema: {
        sessionId: z.string().uuid().describe('The session id to reset'),
      },
    },
    async ({ sessionId }) => {
      const session = await service.resetSession(sessionId)
      return textResult('Reset session', session)
    },
  )
}
