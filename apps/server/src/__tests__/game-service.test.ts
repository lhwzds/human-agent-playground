import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GameService } from '../game-service.js'

describe('GameService', () => {
  it('creates sessions and plays legal moves', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const session = await service.createSession({ gameId: 'xiangqi' })
    expect(session.state.turn).toBe('red')

    const moves = await service.getLegalMoves(session.id, 'h3')
    expect(moves.some((move) => move.to === 'h9')).toBe(false)

    const updated = await service.playMove(session.id, { from: 'h3', to: 'h9' }).catch((error) => error)
    expect(updated).toBeInstanceOf(Error)
  })

  it('persists sessions to disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const dataPath = join(directory, 'sessions.json')

    const service = new GameService(dataPath)
    const session = await service.createSession({ gameId: 'xiangqi' })
    await service.playMove(session.id, { from: 'h3', to: 'h9' }).catch(() => null)

    const reloaded = new GameService(dataPath)
    const sessions = await reloaded.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(session.id)
  })

  it('lists the game catalog and rejects unsupported games', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const games = await service.listGames()
    expect(games.map((game) => game.id)).toContain('xiangqi')

    const error = await service.createSession({ gameId: 'go' }).catch((value) => value)
    expect(error).toBeInstanceOf(Error)
  })

  it('notifies session subscribers when a move lands', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })
    const events: Array<{ updatedAt: string; lastMove: string | null }> = []

    const unsubscribe = service.subscribeSession(session.id, (updatedSession) => {
      const state = updatedSession.state as { lastMove?: { from: string; to: string } | null }
      events.push({
        updatedAt: updatedSession.updatedAt,
        lastMove: state.lastMove ? `${state.lastMove.from}-${state.lastMove.to}` : null,
      })
    })

    await service.playMove(session.id, { from: 'a4', to: 'a5' })
    unsubscribe()

    expect(events).toHaveLength(1)
    expect(events[0].lastMove).toBe('a4-a5')
  })
})
