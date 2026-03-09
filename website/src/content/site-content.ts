export const siteMetadata = {
  title: 'Human Agent Playground',
  tagline: 'One shared game table for humans and AI agent apps.',
  description:
    'Human Agent Playground is a local game-playground repo where humans and MCP-capable agent apps operate on the same live Xiangqi session.',
  domain: 'humanagentplayground.com',
  demoUrl: import.meta.env.PUBLIC_DEMO_URL ?? '',
  repositoryUrl: 'https://github.com/lhwzds/human-agent-playground',
} as const

export const entryPoints = [
  {
    title: 'Web UI',
    description: 'A human-friendly board view for creating sessions, playing moves, and watching the timeline update live.',
  },
  {
    title: 'HTTP API',
    description: 'A server interface for reading session state, resetting games, and wiring other local tools into the same match.',
  },
  {
    title: 'MCP Server',
    description: 'A Streamable HTTP MCP endpoint for Codex, Claude Code, Gemini CLI, OpenClaw, and other MCP-capable agents.',
  },
] as const

export const supportedAgents = [
  'Codex',
  'Claude Code',
  'Gemini CLI',
  'OpenClaw',
  'Other MCP-capable hosts',
] as const

export const workflowSteps = [
  'Create or join one shared session.',
  'Read the live board state from MCP or UI.',
  'Play one move and wait for the opponent reply.',
  'Keep the same session synchronized everywhere.',
] as const

export const featureCards = [
  {
    title: 'Shared session model',
    body: 'Humans and agents never fork into separate matches. They act on one session id and one timeline.',
  },
  {
    title: 'Full-game agent loops',
    body: 'Agents can keep chaining xiangqi_play_move_and_wait until the game finishes, instead of stopping after one move.',
  },
  {
    title: 'Local-first deployment',
    body: 'Run the application on your own machine, point your agent app at the MCP endpoint, and start a match immediately.',
  },
] as const

export const promptExamples = [
  {
    title: 'Start a full game',
    body: 'Create or join one Xiangqi session, make the first move if needed, and then keep using xiangqi_play_move_and_wait until the game finishes. Do not stop after one move cycle. Do not reply in chat between turns unless the game is finished or you are blocked.',
  },
  {
    title: 'Join a human session',
    body: 'Join my current Xiangqi session as black. After the game starts, keep calling xiangqi_play_move_and_wait after every ready result until the game reaches finished. Re-read the live state every cycle and generate fresh reasoning for each move.',
  },
] as const

export const setupSteps = [
  {
    title: 'Run the local app',
    body: 'Start the Human Agent Playground server and web app so the shared session, SSE stream, and MCP endpoint are available.',
  },
  {
    title: 'Connect your agent host',
    body: 'Configure the MCP server URL in Codex, Claude Code, Gemini CLI, OpenClaw, or another local agent app.',
  },
  {
    title: 'Play on one board',
    body: 'Let a human use the UI while the agent operates through MCP. Both sides stay synchronized on the same board.',
  },
] as const
