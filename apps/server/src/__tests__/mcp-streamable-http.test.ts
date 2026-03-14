import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { GameService } from '../game-service.js'

function extractPayload(result: unknown) {
  if (
    result &&
    typeof result === 'object' &&
    'structuredContent' in result &&
    result.structuredContent &&
    typeof result.structuredContent === 'object' &&
    'payload' in result.structuredContent
  ) {
    return result.structuredContent.payload
  }

  return result
}

describe('Streamable HTTP MCP server', () => {
  const resources: Array<{
    close: () => Promise<void>
  }> = []

  afterEach(async () => {
    while (resources.length > 0) {
      const resource = resources.pop()
      await resource?.close()
    }
  })

  it('serves MCP tools over /mcp and plays a Xiangqi move', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const app = createApp(service)
    const server = createServer(app)

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })

    resources.push({
      close: async () => {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error)
              return
            }

            resolve()
          })
        })
      },
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address')
    }

    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`))
    resources.push({
      close: async () => {
        await transport.close()
      },
    })

    const client = new Client({ name: 'test-streamable-http-client', version: '0.1.0' })
    await client.connect(transport)

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'list_games',
        'list_sessions',
        'search_tools',
        'create_session',
        'get_game_state',
        'wait_for_turn',
        'chess_get_legal_moves',
        'chess_play_move',
        'chess_play_move_and_wait',
        'connect_four_get_legal_moves',
        'connect_four_play_move',
        'connect_four_play_move_and_wait',
        'reset_session',
        'gomoku_get_legal_moves',
        'gomoku_play_move',
        'gomoku_play_move_and_wait',
        'othello_get_legal_moves',
        'othello_play_move',
        'othello_play_move_and_wait',
        'xiangqi_get_legal_moves',
        'xiangqi_play_move',
        'xiangqi_play_move_and_wait',
      ]),
    )
    expect(
      tools.tools.find((tool) => tool.name === 'search_tools')?._meta?.['human-agent-playground/tool'],
    ).toEqual(
      expect.objectContaining({
        category: 'catalog',
        tags: expect.arrayContaining(['tools', 'search']),
      }),
    )
    expect(
      tools.tools.find((tool) => tool.name === 'chess_play_move')?._meta?.['human-agent-playground/tool'],
    ).toEqual(
      expect.objectContaining({
        category: 'gameplay',
        gameId: 'chess',
      }),
    )
    expect(
      tools.tools.find((tool) => tool.name === 'connect_four_play_move')?._meta?.['human-agent-playground/tool'],
    ).toEqual(
      expect.objectContaining({
        category: 'gameplay',
        gameId: 'connect-four',
      }),
    )
    expect(
      tools.tools.find((tool) => tool.name === 'gomoku_play_move')?._meta?.['human-agent-playground/tool'],
    ).toEqual(
      expect.objectContaining({
        category: 'gameplay',
        gameId: 'gomoku',
      }),
    )
    expect(
      tools.tools.find((tool) => tool.name === 'othello_play_move')?._meta?.['human-agent-playground/tool'],
    ).toEqual(
      expect.objectContaining({
        category: 'gameplay',
        gameId: 'othello',
      }),
    )
    expect(
      tools.tools.find((tool) => tool.name === 'xiangqi_play_move')?._meta?.['human-agent-playground/tool'],
    ).toEqual(
      expect.objectContaining({
        category: 'gameplay',
        gameId: 'xiangqi',
      }),
    )
    expect(tools.tools.find((tool) => tool.name === 'wait_for_turn')?.description).toContain('IMPORTANT')
    expect(tools.tools.find((tool) => tool.name === 'wait_for_turn')?.description).toContain('NEVER')
    expect(tools.tools.find((tool) => tool.name === 'wait_for_turn')?.description).toContain(
      'foreground blocking MCP call',
    )
    expect(tools.tools.find((tool) => tool.name === 'wait_for_turn')?.description).toContain(
      '600000 ms',
    )
    expect(tools.tools.find((tool) => tool.name === 'xiangqi_play_move')?.description).toContain(
      'NEVER stop to send a chat reply before moving',
    )
    expect(tools.tools.find((tool) => tool.name === 'chess_play_move_and_wait')?.description).toContain(
      'foreground blocking MCP call',
    )
    expect(tools.tools.find((tool) => tool.name === 'chess_play_move_and_wait')?.description).toContain(
      '600000 ms',
    )
    expect(tools.tools.find((tool) => tool.name === 'chess_play_move_and_wait')?.description).toContain(
      'detached terminal loop',
    )
    expect(tools.tools.find((tool) => tool.name === 'xiangqi_play_move_and_wait')?.description).toContain(
      'IMPORTANT',
    )
    expect(tools.tools.find((tool) => tool.name === 'xiangqi_play_move_and_wait')?.description).toContain('NEVER')
    expect(tools.tools.find((tool) => tool.name === 'xiangqi_play_move_and_wait')?.description).toContain(
      'opponent completes exactly one reply',
    )
    expect(tools.tools.find((tool) => tool.name === 'xiangqi_play_move_and_wait')?.description).toContain(
      'full game',
    )

    const searchResult = extractPayload(
      await client.callTool({
        name: 'search_tools',
        arguments: {
          category: 'gameplay',
          gameId: 'xiangqi',
        },
      }),
    ) as {
      categories: string[]
      tools: Array<{ name: string; category: string; gameId?: string }>
    }

    expect(searchResult.categories).toEqual(expect.arrayContaining(['catalog', 'gameplay', 'session']))
    expect(searchResult.tools.map((tool) => tool.name)).toEqual([
      'xiangqi_get_legal_moves',
      'xiangqi_play_move',
      'xiangqi_play_move_and_wait',
    ])

    const chessSearchResult = extractPayload(
      await client.callTool({
        name: 'search_tools',
        arguments: {
          category: 'gameplay',
          gameId: 'chess',
        },
      }),
    ) as {
      tools: Array<{ name: string }>
    }

    expect(chessSearchResult.tools.map((tool) => tool.name)).toEqual([
      'chess_get_legal_moves',
      'chess_play_move',
      'chess_play_move_and_wait',
    ])

    const gomokuSearchResult = extractPayload(
      await client.callTool({
        name: 'search_tools',
        arguments: {
          category: 'gameplay',
          gameId: 'gomoku',
        },
      }),
    ) as {
      tools: Array<{ name: string }>
    }

    expect(gomokuSearchResult.tools.map((tool) => tool.name)).toEqual([
      'gomoku_get_legal_moves',
      'gomoku_play_move',
      'gomoku_play_move_and_wait',
    ])

    const connectFourSearchResult = extractPayload(
      await client.callTool({
        name: 'search_tools',
        arguments: {
          category: 'gameplay',
          gameId: 'connect-four',
        },
      }),
    ) as {
      tools: Array<{ name: string }>
    }

    expect(connectFourSearchResult.tools.map((tool) => tool.name)).toEqual([
      'connect_four_get_legal_moves',
      'connect_four_play_move',
      'connect_four_play_move_and_wait',
    ])

    const othelloSearchResult = extractPayload(
      await client.callTool({
        name: 'search_tools',
        arguments: {
          category: 'gameplay',
          gameId: 'othello',
        },
      }),
    ) as {
      tools: Array<{ name: string }>
    }

    expect(othelloSearchResult.tools.map((tool) => tool.name)).toEqual([
      'othello_get_legal_moves',
      'othello_play_move',
      'othello_play_move_and_wait',
    ])

    const created = extractPayload(
      await client.callTool({
        name: 'create_session',
        arguments: {
          gameId: 'xiangqi',
        },
      }),
    ) as {
      id: string
      events: Array<{ id: string }>
      state: { turn: string }
    }

    expect(created.state.turn).toBe('red')

    const chessCreated = extractPayload(
      await client.callTool({
        name: 'create_session',
        arguments: {
          gameId: 'chess',
        },
      }),
    ) as {
      id: string
      state: { turn: string }
    }

    expect(chessCreated.state.turn).toBe('white')

    const chessLegalMoves = extractPayload(
      await client.callTool({
        name: 'chess_get_legal_moves',
        arguments: {
          sessionId: chessCreated.id,
          from: 'e2',
        },
      }),
    ) as { moves: Array<{ to: string }> }

    expect(chessLegalMoves.moves.map((move) => move.to)).toEqual(expect.arrayContaining(['e3', 'e4']))

    const chessPlayed = extractPayload(
      await client.callTool({
        name: 'chess_play_move',
        arguments: {
          sessionId: chessCreated.id,
          from: 'e2',
          to: 'e4',
          reasoning: {
            summary: 'Occupy the center with the king pawn.',
            reasoningSteps: ['The central pawn advance gains space and opens lines for development.'],
            confidence: 0.76,
          },
        },
      }),
    ) as {
      state: { turn: string; lastMove: { san: string } }
    }

    expect(chessPlayed.state.turn).toBe('black')
    expect(chessPlayed.state.lastMove.san).toBe('e4')

    const lastEventId = created.events.at(-1)?.id
    const waitPromise = client.callTool({
      name: 'wait_for_turn',
      arguments: {
        sessionId: created.id,
        expectedTurn: 'black',
        afterEventId: lastEventId,
        timeoutMs: 5_000,
      },
    })

    const legalMoves = extractPayload(
      await client.callTool({
        name: 'xiangqi_get_legal_moves',
        arguments: {
          sessionId: created.id,
          from: 'a4',
        },
      }),
    ) as {
      moves: Array<{ to: string }>
    }

    expect(legalMoves.moves.map((move) => move.to)).toContain('a5')

    const updated = extractPayload(
      await client.callTool({
        name: 'xiangqi_play_move',
        arguments: {
          sessionId: created.id,
          from: 'a4',
          to: 'a5',
          reasoning: {
            summary: 'Advance the pawn to claim space on the file.',
            reasoningSteps: ['The pawn push is legal and immediately improves board presence.'],
            confidence: 0.68,
          },
        },
      }),
    ) as {
      state: {
        turn: string
        lastMove: { from: string; to: string }
      }
      events: Array<{
        reasoning?: {
          summary: string
          reasoningSteps: string[]
        }
      }>
    }

    expect(updated.state.turn).toBe('black')
    expect(updated.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a4',
        to: 'a5',
      }),
    )
    expect(updated.events.at(-1)?.reasoning).toEqual(
      expect.objectContaining({
        summary: 'Advance the pawn to claim space on the file.',
        reasoningSteps: ['The pawn push is legal and immediately improves board presence.'],
      }),
    )

    const waitResult = extractPayload(await waitPromise) as {
      status: string
      session: {
        state: {
          turn: string
        }
      }
      event: {
        kind: string
      } | null
    }

    expect(waitResult.status).toBe('ready')
    expect(waitResult.session.state.turn).toBe('black')
    expect(waitResult.event).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )

    const secondCreated = extractPayload(
      await client.callTool({
        name: 'create_session',
        arguments: {
          gameId: 'xiangqi',
        },
      }),
    ) as {
      id: string
      state: { turn: string }
    }

    setTimeout(() => {
      void service.playMove(secondCreated.id, { from: 'a7', to: 'a6' })
    }, 20)

    const playAndWaitResult = extractPayload(
      await client.callTool({
        name: 'xiangqi_play_move_and_wait',
        arguments: {
          sessionId: secondCreated.id,
          from: 'a4',
          to: 'a5',
          timeoutMs: 5_000,
          reasoning: {
            summary: 'Advance the pawn and keep the move cycle inside one MCP tool call.',
            reasoningSteps: [
              'The pawn push is legal and claims space immediately.',
              'Using the combined play-and-wait tool avoids breaking the shared turn loop.',
            ],
            confidence: 0.7,
          },
        },
      }),
    ) as {
      status: string
      playedSession: {
        state: {
          turn: string
          lastMove: { from: string; to: string; side: string }
        }
      }
      playedEvent: {
        kind: string
      } | null
      session: {
        state: {
          turn: string
          lastMove: { from: string; to: string; side: string }
        }
      }
      event: {
        kind: string
      } | null
    }

    expect(playAndWaitResult.status).toBe('ready')
    expect(playAndWaitResult.playedSession.state.turn).toBe('black')
    expect(playAndWaitResult.playedSession.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a4',
        to: 'a5',
        side: 'red',
      }),
    )
    expect(playAndWaitResult.playedEvent).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )
    expect(playAndWaitResult.session.state.turn).toBe('red')
    expect(playAndWaitResult.session.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a7',
        to: 'a6',
        side: 'black',
      }),
    )
    expect(playAndWaitResult.event).toEqual(
      expect.objectContaining({
        kind: 'move_played',
      }),
    )

    const gomokuCreated = extractPayload(
      await client.callTool({
        name: 'create_session',
        arguments: {
          gameId: 'gomoku',
        },
      }),
    ) as {
      id: string
      state: { turn: string }
    }

    expect(gomokuCreated.state.turn).toBe('black')

    const gomokuLegalMoves = extractPayload(
      await client.callTool({
        name: 'gomoku_get_legal_moves',
        arguments: {
          sessionId: gomokuCreated.id,
          point: 'h8',
        },
      }),
    ) as {
      moves: Array<{ point: string }>
    }

    expect(gomokuLegalMoves.moves).toEqual([{ point: 'h8' }])

    const gomokuUpdated = extractPayload(
      await client.callTool({
        name: 'gomoku_play_move',
        arguments: {
          sessionId: gomokuCreated.id,
          point: 'h8',
          reasoning: {
            summary: 'Claim the center point to maximize future line options.',
            reasoningSteps: ['The center provides the widest expansion in every direction.'],
            confidence: 0.72,
          },
        },
      }),
    ) as {
      state: {
        turn: string
        lastMove: { point: string; side: string }
      }
      events: Array<{
        reasoning?: {
          summary: string
        }
      }>
    }

    expect(gomokuUpdated.state.turn).toBe('white')
    expect(gomokuUpdated.state.lastMove).toEqual(
      expect.objectContaining({
        point: 'h8',
        side: 'black',
      }),
    )
    expect(gomokuUpdated.events.at(-1)?.reasoning).toEqual(
      expect.objectContaining({
        summary: 'Claim the center point to maximize future line options.',
      }),
    )

    await transport.terminateSession()
  })
})
