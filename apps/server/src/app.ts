import { randomUUID } from 'node:crypto'

import express from 'express'
import cors from 'cors'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { GameSession, SessionStreamEvent } from '@human-agent-playground/core'

import { GameService, GameServiceError } from './game-service.js'
import { createMcpServer } from './mcp/create-mcp-server.js'

export function createApp(service = new GameService()) {
  const app = express()
  const mcpTransports = new Map<string, StreamableHTTPServerTransport>()

  app.use(cors())
  app.use(express.json())

  app.get('/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.all('/mcp', async (request, response) => {
    try {
      const headerValue = request.headers['mcp-session-id']
      const sessionId = Array.isArray(headerValue) ? headerValue[0] : headerValue

      let transport = sessionId ? mcpTransports.get(sessionId) : undefined

      if (!transport) {
        if (request.method !== 'POST' || !isInitializeRequest(request.body)) {
          response.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          })
          return
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (nextSessionId) => {
            mcpTransports.set(nextSessionId, transport!)
          },
        })

        transport.onclose = () => {
          const activeSessionId = transport?.sessionId
          if (activeSessionId) {
            mcpTransports.delete(activeSessionId)
          }
        }

        const mcpServer = createMcpServer(service)
        await mcpServer.connect(transport)
      }

      await transport.handleRequest(request, response, request.body)
    } catch (error) {
      console.error('Failed to handle MCP request:', error)

      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        })
      }
    }
  })

  app.get('/api/sessions', async (_request, response, next) => {
    try {
      response.json({ sessions: await service.listSessions() })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/games', async (_request, response, next) => {
    try {
      response.json({ games: await service.listGames() })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/sessions', async (_request, response, next) => {
    try {
      response.status(201).json(await service.createSession(_request.body))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions/:sessionId', async (request, response, next) => {
    try {
      response.json(await service.getSession(request.params.sessionId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/ai/providers', async (_request, response, next) => {
    try {
      response.json({ providers: await service.listProviderCapabilities() })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/ai/auth-profiles', async (_request, response, next) => {
    try {
      response.json({ profiles: await service.listAuthProfiles() })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/ai/auth-profiles', async (request, response, next) => {
    try {
      response.status(201).json(await service.createAuthProfile(request.body))
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/ai/auth-profiles/:profileId', async (request, response, next) => {
    try {
      response.json(await service.updateAuthProfile(request.params.profileId, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/ai/auth-profiles/:profileId', async (request, response, next) => {
    try {
      response.json(await service.deleteAuthProfile(request.params.profileId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/ai/auth-profiles/:profileId/test', async (request, response, next) => {
    try {
      response.json(await service.testAuthProfile(request.params.profileId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/ai/runtime-settings', async (_request, response, next) => {
    try {
      response.json(await service.getAiRuntimeSettings())
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/ai/runtime-settings', async (request, response, next) => {
    try {
      response.json({ settings: await service.updateAiRuntimeSettings(request.body) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions/:sessionId/ai-seats', async (request, response, next) => {
    try {
      response.json({ seats: await service.getAiSeats(request.params.sessionId) })
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/sessions/:sessionId/ai-seats/:side', async (request, response, next) => {
    try {
      response.json(await service.updateAiSeat(request.params.sessionId, request.params.side, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/sessions/:sessionId/ai-seats/:side/launcher', async (request, response, next) => {
    try {
      response.json(await service.updateAiSeatLauncher(request.params.sessionId, request.params.side, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions/:sessionId/stream', async (request, response, next) => {
    try {
      const session = await service.getSession(request.params.sessionId)

      response.setHeader('Content-Type', 'text/event-stream')
      response.setHeader('Cache-Control', 'no-cache, no-transform')
      response.setHeader('Connection', 'keep-alive')
      response.setHeader('X-Accel-Buffering', 'no')
      response.flushHeaders()

      writeSessionEvent(response, session)

      const unsubscribe = service.subscribeSession(request.params.sessionId, (updatedSession) => {
        writeSessionEvent(response, updatedSession)
      })

      const keepAlive = setInterval(() => {
        response.write(': keepalive\n\n')
      }, 15_000)

      request.on('close', () => {
        clearInterval(keepAlive)
        unsubscribe()
        response.end()
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions/:sessionId/legal-moves', async (request, response, next) => {
    try {
      response.json({
        moves: await service.getLegalMoves(request.params.sessionId, request.query),
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/sessions/:sessionId/moves', async (request, response, next) => {
    try {
      response.json(await service.playMove(request.params.sessionId, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/sessions/:sessionId/reset', async (request, response, next) => {
    try {
      response.json(await service.resetSession(request.params.sessionId, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof GameServiceError) {
      response.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        ...(error.details ?? {}),
      })
      return
    }

    const message = error instanceof Error ? error.message : 'Unexpected server error'
    const statusCode =
      message.startsWith('Session not found') ? 404 : message.startsWith('Unsupported game') ? 404 : 400
    response.status(statusCode).json({ error: message })
  })

  return app
}

function writeSessionEvent(response: express.Response, session: GameSession) {
  const payload: SessionStreamEvent = { session }
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}
