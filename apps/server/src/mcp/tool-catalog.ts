import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'

export interface ToolCatalogEntry {
  name: string
  title: string
  description: string
  category: string
  gameId?: string
  tags: string[]
  annotations?: ToolAnnotations
  inputSchema?: Record<string, z.ZodType>
  handler: (args: unknown) => Promise<unknown> | unknown
}

export interface ToolSearchInput {
  query?: string
  category?: string
  gameId?: string
  tags?: string[]
  limit?: number
}

export interface ToolSearchResult {
  name: string
  title: string
  description: string
  category: string
  gameId?: string
  tags: string[]
}

const TOOL_META_KEY = 'human-agent-playground/tool'

export function textResult(title: string, payload: unknown) {
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

export function serializeToolCatalogEntry(entry: ToolCatalogEntry): ToolSearchResult {
  return {
    name: entry.name,
    title: entry.title,
    description: entry.description,
    category: entry.category,
    gameId: entry.gameId,
    tags: [...entry.tags],
  }
}

export function listToolCategories(entries: ToolCatalogEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.category))].sort()
}

export function searchToolCatalog(entries: ToolCatalogEntry[], input: ToolSearchInput = {}): ToolSearchResult[] {
  const normalizedQuery = input.query?.trim().toLowerCase()
  const normalizedCategory = input.category?.trim().toLowerCase()
  const normalizedGameId = input.gameId?.trim().toLowerCase()
  const normalizedTags = (input.tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50))

  return entries
    .map((entry) => ({
      entry,
      score: scoreToolCatalogEntry(entry, {
        normalizedQuery,
        normalizedCategory,
        normalizedGameId,
        normalizedTags,
      }),
    }))
    .filter((candidate): candidate is { entry: ToolCatalogEntry; score: number } => candidate.score !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (left.entry.category !== right.entry.category) {
        return left.entry.category.localeCompare(right.entry.category)
      }

      return left.entry.name.localeCompare(right.entry.name)
    })
    .slice(0, limit)
    .map(({ entry }) => serializeToolCatalogEntry(entry))
}

export function registerToolCatalog(server: McpServer, entries: ToolCatalogEntry[]) {
  for (const entry of entries) {
    server.registerTool(
      entry.name,
      {
        title: entry.title,
        description: entry.description,
        inputSchema: entry.inputSchema,
        annotations: entry.annotations,
        _meta: {
          [TOOL_META_KEY]: serializeToolCatalogEntry(entry),
        },
      },
      entry.handler as never,
    )
  }
}

function scoreToolCatalogEntry(
  entry: ToolCatalogEntry,
  filters: {
    normalizedQuery?: string
    normalizedCategory?: string
    normalizedGameId?: string
    normalizedTags: string[]
  },
): number | null {
  const category = entry.category.toLowerCase()
  const gameId = entry.gameId?.toLowerCase()
  const tags = entry.tags.map((tag) => tag.toLowerCase())
  const haystacks = [entry.name, entry.title, entry.description, category, gameId ?? '', ...tags].map((value) =>
    value.toLowerCase(),
  )

  if (filters.normalizedCategory && category !== filters.normalizedCategory) {
    return null
  }

  if (filters.normalizedGameId && gameId !== filters.normalizedGameId) {
    return null
  }

  if (filters.normalizedTags.length > 0 && !filters.normalizedTags.every((tag) => tags.includes(tag))) {
    return null
  }

  if (!filters.normalizedQuery) {
    return 1
  }

  let score = 0
  for (const value of haystacks) {
    if (value === filters.normalizedQuery) {
      score += 30
      continue
    }

    if (value.startsWith(filters.normalizedQuery)) {
      score += 15
      continue
    }

    if (value.includes(filters.normalizedQuery)) {
      score += 5
    }
  }

  return score > 0 ? score : null
}
