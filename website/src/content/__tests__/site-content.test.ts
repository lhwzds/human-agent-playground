import { describe, expect, it } from 'vitest'

import {
  entryPoints,
  promptExamples,
  siteMetadata,
  supportedAgents,
  workflowSteps,
} from '../site-content'

describe('site content', () => {
  it('describes the shared playground clearly', () => {
    expect(siteMetadata.title).toBe('Human Agent Playground')
    expect(siteMetadata.description).toContain('MCP')
  })

  it('keeps the three access points visible', () => {
    expect(entryPoints.map((item) => item.title)).toEqual([
      'Web UI',
      'HTTP API',
      'MCP Server',
    ])
  })

  it('mentions major MCP-capable hosts', () => {
    expect(supportedAgents).toContain('Codex')
    expect(supportedAgents).toContain('Claude Code')
    expect(supportedAgents).toContain('Gemini CLI')
  })

  it('teaches the full-game prompt shape', () => {
    expect(promptExamples[0]?.body).toContain('xiangqi_play_move_and_wait')
    expect(promptExamples[0]?.body).toContain('Do not stop after one move cycle')
    expect(workflowSteps).toHaveLength(4)
  })
})
