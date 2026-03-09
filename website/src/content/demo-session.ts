import {
  createInitialXiangqiGame,
  playXiangqiMove,
  type XiangqiBoard,
  type XiangqiGameState,
  type XiangqiMove,
} from '@human-agent-playground/game-xiangqi'

export interface DemoFeedItem {
  actor: 'human' | 'agent'
  channel: 'ui' | 'mcp'
  moveLabel: string
  summary: string
  detail: string
  reasoning?: string
}

export interface DemoSnapshot {
  id: string
  board: XiangqiBoard
  turn: XiangqiGameState['turn']
  status: XiangqiGameState['status']
  winner: XiangqiGameState['winner']
  moveCount: number
  lastMove: XiangqiMove | null
  feed: DemoFeedItem[]
  headline: string
}

interface ScriptedMove {
  actor: DemoFeedItem['actor']
  channel: DemoFeedItem['channel']
  from: string
  to: string
  summary: string
  reasoning?: string
}

const scriptedMoves: ScriptedMove[] = [
  {
    actor: 'agent',
    channel: 'mcp',
    from: 'b3',
    to: 'b10',
    summary: 'Red opens with a cannon capture to show that agent moves and reasoning appear in the same shared feed.',
    reasoning: 'The cannon capture is legal from the opening position and immediately demonstrates that the board and message feed can move together without a live backend.',
  },
  {
    actor: 'human',
    channel: 'ui',
    from: 'a10',
    to: 'b10',
    summary: 'Black answers from the UI by recapturing the cannon with the rook.',
  },
  {
    actor: 'agent',
    channel: 'mcp',
    from: 'h3',
    to: 'h10',
    summary: 'The second cannon mirrors the first attack so the static demo shows both sides contributing to one session.',
    reasoning: 'Using the opposite cannon keeps the replay visually clear and reinforces the idea that MCP actions are just another way to write to the same board.',
  },
  {
    actor: 'human',
    channel: 'ui',
    from: 'i10',
    to: 'h10',
    summary: 'Black recaptures again, proving that UI actions and MCP actions share one move timeline.',
  },
  {
    actor: 'agent',
    channel: 'mcp',
    from: 'e4',
    to: 'e5',
    summary: 'Red switches from tactical captures to a normal central pawn push.',
    reasoning: 'The center pawn advance gives the replay a more natural opening flow after the two cannon exchanges.',
  },
  {
    actor: 'human',
    channel: 'ui',
    from: 'e7',
    to: 'e6',
    summary: 'Black meets the center push directly from the UI.',
  },
  {
    actor: 'agent',
    channel: 'mcp',
    from: 'e5',
    to: 'e6',
    summary: 'Red captures the central soldier and keeps the shared-session feed moving.',
    reasoning: 'The follow-up capture shows that the static demo can still present concrete move-by-move consequences without connecting to a live server.',
  },
  {
    actor: 'human',
    channel: 'ui',
    from: 'c10',
    to: 'e8',
    summary: 'Black develops the elephant to stop the advanced pawn.',
  },
  {
    actor: 'agent',
    channel: 'mcp',
    from: 'e6',
    to: 'e7',
    summary: 'Red continues pushing the advanced pawn to show progress toward the back rank.',
    reasoning: 'This keeps the sequence easy to read and leaves the static demo in an active, unfinished but clearly evolving position.',
  },
]

function cloneBoard(board: XiangqiBoard): XiangqiBoard {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)))
}

function buildMoveLabel(move: XiangqiMove): string {
  return `${move.from} -> ${move.to}`
}

function buildSnapshots(): DemoSnapshot[] {
  const snapshots: DemoSnapshot[] = []
  let game = createInitialXiangqiGame()
  const feed: DemoFeedItem[] = [
    {
      actor: 'agent',
      channel: 'mcp',
      moveLabel: 'Session created',
      summary: 'A new Xiangqi session is created for one human and one MCP-capable agent.',
      detail: 'This landing-page demo replays a recorded shared session with static data.',
    },
  ]

  snapshots.push({
    id: 'opening-position',
    board: cloneBoard(game.board),
    turn: game.turn,
    status: game.status,
    winner: game.winner,
    moveCount: game.moveCount,
    lastMove: null,
    feed: [...feed],
    headline: 'Opening position',
  })

  scriptedMoves.forEach((step, index) => {
    game = playXiangqiMove(game, step.from as XiangqiMove['from'], step.to as XiangqiMove['to'])

    if (!game.lastMove) {
      throw new Error(`Missing move payload after replay step ${index}`)
    }

    feed.push({
      actor: step.actor,
      channel: step.channel,
      moveLabel: buildMoveLabel(game.lastMove),
      summary: step.summary,
      detail: `${game.lastMove.side} played ${game.lastMove.from} -> ${game.lastMove.to}.`,
      reasoning: step.reasoning,
    })

    snapshots.push({
      id: `snapshot-${index + 1}`,
      board: cloneBoard(game.board),
      turn: game.turn,
      status: game.status,
      winner: game.winner,
      moveCount: game.moveCount,
      lastMove: game.lastMove,
      feed: [...feed],
      headline:
        step.actor === 'agent'
          ? 'Agent and human keep sharing the same session.'
          : 'UI and MCP continue writing to one board.',
    })
  })

  return snapshots
}

export const demoSnapshots = buildSnapshots()
