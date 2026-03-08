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
        'reset_session',
        'xiangqi_get_legal_moves',
        'xiangqi_play_move',
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
      tools.tools.find((tool) => tool.name === 'xiangqi_play_move')?._meta?.['human-agent-playground/tool'],
    ).toEqual(
      expect.objectContaining({
        category: 'gameplay',
        gameId: 'xiangqi',
      }),
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
        },
      }),
    ) as {
      state: {
        turn: string
        lastMove: { from: string; to: string }
      }
    }

    expect(updated.state.turn).toBe('black')
    expect(updated.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a4',
        to: 'a5',
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

    await transport.terminateSession()
  })
})
