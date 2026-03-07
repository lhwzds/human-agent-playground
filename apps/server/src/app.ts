import express from 'express'
import cors from 'cors'

import { GameService } from './game-service.js'

export function createApp(service = new GameService()) {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/health', (_request, response) => {
    response.json({ ok: true })
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
      response.json(await service.resetSession(request.params.sessionId))
    } catch (error) {
      next(error)
    }
  })

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    const statusCode =
      message.startsWith('Session not found') ? 404 : message.startsWith('Unsupported game') ? 404 : 400
    response.status(statusCode).json({ error: message })
  })

  return app
}
