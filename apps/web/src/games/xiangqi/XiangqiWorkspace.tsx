import type { GameSession } from '@human-agent-playground/core'
import {
  squareToCoordinates,
  type Square,
  type XiangqiGameState,
  type XiangqiMove,
} from '@human-agent-playground/game-xiangqi'
import { useEffect, useState } from 'react'

import type { GameWorkspaceProps } from '../types'
import { getXiangqiLegalMoves, playXiangqiMove } from './api'
import { XiangqiBoard } from './components/XiangqiBoard'

function toXiangqiSession(session: GameSession): GameSession<XiangqiGameState> {
  if (
    session.gameId !== 'xiangqi' ||
    typeof session.state !== 'object' ||
    session.state === null ||
    (session.state as { kind?: unknown }).kind !== 'xiangqi'
  ) {
    throw new Error('Invalid Xiangqi session payload')
  }

  return session as GameSession<XiangqiGameState>
}

export function XiangqiWorkspace({
  game,
  session: rawSession,
  error,
  setupPanel,
  onSessionUpdate,
  onRefreshSession,
  onResetSession,
  onError,
}: GameWorkspaceProps) {
  const session = toXiangqiSession(rawSession)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [legalMoves, setLegalMoves] = useState<XiangqiMove[]>([])

  useEffect(() => {
    setSelectedSquare(null)
    setLegalMoves([])
  }, [session.id, session.updatedAt])

  async function handleSquareClick(square: Square) {
    if (session.mode === 'agent-vs-agent') {
      onError('This session is agent-vs-agent. Drive it through MCP or a future auto-runner.')
      return
    }

    const { row, col } = squareToCoordinates(square)
    const piece = session.state.board[row][col]

    try {
      onError(null)

      if (selectedSquare && legalMoves.some((move) => move.to === square)) {
        const updated = await playXiangqiMove(session.id, selectedSquare, square)
        onSessionUpdate(updated)
        setSelectedSquare(null)
        setLegalMoves([])
        return
      }

      if (piece?.side === session.state.turn) {
        const moves = await getXiangqiLegalMoves(session.id, square)
        setSelectedSquare(square)
        setLegalMoves(moves)
        return
      }

      setSelectedSquare(null)
      setLegalMoves([])
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : 'Move failed')
    }
  }

  async function handleReset() {
    try {
      onError(null)
      await onResetSession(session.id)
      setSelectedSquare(null)
      setLegalMoves([])
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : 'Reset failed')
    }
  }

  const legalTargets = new Set(legalMoves.map((move) => move.to))
  const lastMove = session.state.lastMove
  const selectedMovesLabel =
    selectedSquare && legalMoves.length > 0
      ? legalMoves.map((move) => move.to).join(', ')
      : 'Select a piece to inspect legal moves.'

  return (
    <>
      <article className="board-panel">
        <XiangqiBoard
          board={session.state.board}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          onSquareClick={handleSquareClick}
        />
      </article>

      <aside className="side-panel">
        {setupPanel}

        <div className="panel-card">
          <h2>Session</h2>
          <p className="mono">{session.id}</p>
          <p>{selectedMovesLabel}</p>
          <p>{game.description}</p>
        </div>

        <div className="panel-card">
          <h2>Last Move</h2>
          <p>{lastMove ? `${lastMove.from} → ${lastMove.to}` : 'No moves yet.'}</p>
          <p>
            {lastMove
              ? `${lastMove.piece.display}${lastMove.captured ? ` captured ${lastMove.captured.display}` : ''}`
              : ''}
          </p>
        </div>

        {session.state.isCheck && (
          <div className="panel-card check-card">
            <h2>Check</h2>
            <p>{session.state.turn} must respond to check before any other move is legal.</p>
          </div>
        )}

        <div className="panel-card">
          <h2>Actions</h2>
          <button className="primary-button" type="button" onClick={handleReset}>
            Reset Session
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={async () => {
              onError(null)
              await onRefreshSession(session.id)
            }}
          >
            Refresh Now
          </button>
        </div>

        <div className="panel-card">
          <h2>MCP Shape</h2>
          <p>Expose tools such as:</p>
          <ul>
            <li>`list_games`</li>
            <li>`list_sessions`</li>
            <li>`get_game_state`</li>
            <li>`xiangqi_get_legal_moves`</li>
            <li>`xiangqi_play_move`</li>
            <li>`reset_session`</li>
          </ul>
        </div>

        {error && (
          <div className="panel-card error-card">
            <h2>Error</h2>
            <p>{error}</p>
          </div>
        )}
      </aside>
    </>
  )
}
