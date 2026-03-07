import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createApp } from '../app.js'
import { GameService } from '../game-service.js'

async function readSessionEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: { value: string },
) {
  while (true) {
    const separatorIndex = buffer.value.indexOf('\n\n')
    if (separatorIndex >= 0) {
      const chunk = buffer.value.slice(0, separatorIndex)
      buffer.value = buffer.value.slice(separatorIndex + 2)
      const dataLine = chunk
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (!dataLine) {
        continue
      }

      return JSON.parse(dataLine.slice(6)) as {
        session: {
          id: string
          state: {
            turn: string
            lastMove: { from: string; to: string } | null
          }
        }
      }
    }

    const { done, value } = await reader.read()
    if (done) {
      throw new Error('Session stream ended before the next event arrived')
    }

    buffer.value += new TextDecoder().decode(value, { stream: true })
  }
}

describe('session stream', () => {
  const resources: Array<{
    close: () => Promise<void>
  }> = []

  afterEach(async () => {
    while (resources.length > 0) {
      const resource = resources.pop()
      await resource?.close()
    }
  })

  it('pushes live session updates over SSE', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-agent-playground-'))
    const service = new GameService(join(directory, 'sessions.json'))
    const session = await service.createSession({ gameId: 'xiangqi' })
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

    const response = await fetch(`http://127.0.0.1:${address.port}/api/sessions/${session.id}/stream`, {
      headers: {
        accept: 'text/event-stream',
      },
    })

    expect(response.ok).toBe(true)
    expect(response.body).not.toBeNull()

    const reader = response.body!.getReader()
    resources.push({
      close: async () => {
        await reader.cancel()
      },
    })

    const buffer = { value: '' }
    const initial = await readSessionEvent(reader, buffer)
    expect(initial.session.id).toBe(session.id)
    expect(initial.session.state.turn).toBe('red')

    await service.playMove(session.id, { from: 'a4', to: 'a5' })

    const updated = await readSessionEvent(reader, buffer)
    expect(updated.session.state.turn).toBe('black')
    expect(updated.session.state.lastMove).toEqual(
      expect.objectContaining({
        from: 'a4',
        to: 'a5',
      }),
    )
  })
})
