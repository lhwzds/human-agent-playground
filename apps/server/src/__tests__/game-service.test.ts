import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GameService } from '../game-service.js'

describe('GameService', () => {
  it('creates sessions and plays legal moves', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const session = await service.createSession({ gameId: 'xiangqi', mode: 'human-vs-agent' })
    expect(session.state.turn).toBe('red')
    expect(session.mode).toBe('human-vs-agent')

    const moves = await service.getLegalMoves(session.id, 'h3')
    expect(moves.some((move) => move.to === 'h9')).toBe(false)

    const updated = await service.playMove(session.id, { from: 'h3', to: 'h9' }).catch((error) => error)
    expect(updated).toBeInstanceOf(Error)
  })

  it('persists sessions to disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const dataPath = join(directory, 'sessions.json')

    const service = new GameService(dataPath)
    const session = await service.createSession({ gameId: 'xiangqi', mode: 'human-vs-agent' })
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

    const error = await service
      .createSession({ gameId: 'go', mode: 'human-vs-agent' })
      .catch((value) => value)
    expect(error).toBeInstanceOf(Error)
  })
})
