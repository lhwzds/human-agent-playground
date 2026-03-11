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
    expect(session.events).toHaveLength(1)
    expect(session.events[0].kind).toBe('session_created')

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
    expect(games.map((game) => game.id)).toContain('gomoku')
    expect(games.map((game) => game.id)).toContain('connect-four')
    expect(games.map((game) => game.id)).toContain('othello')

    const error = await service.createSession({ gameId: 'go' }).catch((value) => value)
    expect(error).toBeInstanceOf(Error)
  })

  it('supports Gomoku session creation, stone placement, and win detection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    let session = await service.createSession({ gameId: 'gomoku' })
    expect(session.state.turn).toBe('black')

    for (const point of ['h8', 'a1', 'i8', 'b1', 'j8', 'c1', 'k8', 'd1', 'l8'] as const) {
      session = await service.playMove(session.id, { point })
    }

    expect(session.state.status).toBe('finished')
    expect(session.state.winner).toBe('black')
    expect(session.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'l8',
        side: 'black',
      }),
    )
    expect(session.state.winningLine).toEqual(['h8', 'i8', 'j8', 'k8', 'l8'])
    expect(session.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        details: expect.objectContaining({
          point: 'l8',
          stoneDisplay: '●',
        }),
      }),
    )
  })

  it('supports Connect Four session creation, disc drops, and win detection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    let session = await service.createSession({ gameId: 'connect-four' })
    expect(session.state.turn).toBe('red')

    for (const column of [1, 1, 2, 2, 3, 3, 4] as const) {
      session = await service.playMove(session.id, { column })
    }

    expect(session.state.status).toBe('finished')
    expect(session.state.winner).toBe('red')
    expect(session.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'd1',
        side: 'red',
      }),
    )
    expect(session.state.winningLine).toEqual(['a1', 'b1', 'c1', 'd1'])
    expect(session.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        details: expect.objectContaining({
          column: 4,
          point: 'd1',
        }),
      }),
    )
  })

  it('supports Othello session creation, flips, and score tracking', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))

    const session = await service.createSession({ gameId: 'othello' })
    const updated = await service.playMove(session.id, { point: 'd3' })

    expect(updated.state.turn).toBe('white')
    expect(updated.state.blackCount).toBe(4)
    expect(updated.state.whiteCount).toBe(1)
    expect(updated.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'd3',
        side: 'black',
        flippedPoints: ['d4'],
      }),
    )
    expect(updated.events.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        details: expect.objectContaining({
          point: 'd3',
          flippedPoints: ['d4'],
          side: 'black',
        }),
      }),
    )
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

  it('records reasoning summaries in the session timeline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })

    const updated = await service.playMove(session.id, {
      from: 'a4',
      to: 'a5',
      actorKind: 'agent',
      channel: 'mcp',
      reasoning: {
        summary: 'Advance the pawn to contest the file and gain space.',
        reasoningSteps: [
          'Compared the center advance with horse development.',
          'Preferred immediate space gain on the open file.',
        ],
        consideredAlternatives: [
          {
            action: 'b1 -> c3',
            summary: 'Develop the horse first.',
            rejectedBecause: 'It delayed immediate file pressure.',
          },
        ],
        confidence: 0.74,
      },
    })

    expect(updated.events).toHaveLength(2)
    expect(updated.events[1]).toEqual(
      expect.objectContaining({
        kind: 'move_played',
        actorKind: 'agent',
        channel: 'mcp',
        reasoning: expect.objectContaining({
          summary: 'Advance the pawn to contest the file and gain space.',
          confidence: 0.74,
        }),
      }),
    )
  })

  it('requires fresh reasoning on agent MCP moves', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })

    const missingReasoningError = await service
      .playMove(session.id, {
        from: 'a4',
        to: 'a5',
        actorKind: 'agent',
        channel: 'mcp',
      })
      .catch((error) => error)

    expect(missingReasoningError).toBeInstanceOf(Error)
    expect(missingReasoningError.message).toContain('reasoning summary')

    const missingStepsError = await service
      .playMove(session.id, {
        from: 'a4',
        to: 'a5',
        actorKind: 'agent',
        channel: 'mcp',
        reasoning: {
          summary: 'Advance the pawn.',
          reasoningSteps: [],
        },
      })
      .catch((error) => error)

    expect(missingStepsError).toBeInstanceOf(Error)
    expect(missingStepsError.message).toContain('reasoning step')
  })

  it('waits until the expected turn arrives without polling outside the service', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })
    const lastEventId = session.events.at(-1)?.id

    const waitPromise = service.waitForTurn(session.id, 'black', {
      afterEventId: lastEventId,
      timeoutMs: 5_000,
    })

    setTimeout(() => {
      void service.playMove(session.id, { from: 'a4', to: 'a5' })
    }, 20)

    const result = await waitPromise

    expect(result.status).toBe('ready')
    expect(result.session.state.turn).toBe('black')
    expect(result.event).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )
  })

  it('plays one move and then waits until the same side can move again', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })

    const playAndWaitPromise = service.playMoveAndWait(
      session.id,
      {
        from: 'a4',
        to: 'a5',
      },
      {
        timeoutMs: 5_000,
      },
    )

    setTimeout(() => {
      void service.playMove(session.id, { from: 'a7', to: 'a6' })
    }, 20)

    const result = await playAndWaitPromise

    expect(result.status).toBe('ready')
    expect(result.playedSession.state.turn).toBe('black')
    expect(result.playedSession.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a4',
        to: 'a5',
        side: 'red',
      }),
    )
    expect(result.playedEvent).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )
    expect(result.session.state.turn).toBe('red')
    expect(result.session.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a7',
        to: 'a6',
        side: 'black',
      }),
    )
    expect(result.event).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )
  })
})
