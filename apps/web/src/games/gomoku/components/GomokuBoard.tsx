import {
  coordinatesToPoint,
  type GomokuBoard as GomokuBoardState,
  type GomokuPoint,
} from '@human-agent-playground/game-gomoku'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o']
const RANKS = Array.from({ length: 15 }, (_, index) => 15 - index)
const STAR_POINTS = new Set(['d12', 'h12', 'l12', 'd8', 'h8', 'l8', 'd4', 'h4', 'l4'])

interface GomokuBoardProps {
  board: GomokuBoardState
  lastMovePoint: GomokuPoint | null
  winningLine: Set<GomokuPoint>
  onPointClick: (point: GomokuPoint) => void
}

export function GomokuBoard({
  board,
  lastMovePoint,
  winningLine,
  onPointClick,
}: GomokuBoardProps) {
  return (
    <div className="board-shell gomoku-board-shell">
      <div className="gomoku-board-layout">
        <div className="gomoku-top-spacer" aria-hidden="true" />
        <div className="gomoku-file-labels" aria-hidden="true">
          {FILES.map((file) => (
            <span key={file} className="board-axis-label">
              {file}
            </span>
          ))}
        </div>

        <div className="gomoku-rank-labels" aria-hidden="true">
          {RANKS.map((rank) => (
            <span key={rank} className="board-axis-label">
              {rank}
            </span>
          ))}
        </div>

        <div className="gomoku-grid">
          {board.flatMap((row, rowIndex) =>
            row.map((stone, colIndex) => {
              const point = coordinatesToPoint(rowIndex, colIndex)
              const classes = ['gomoku-point']

              if (lastMovePoint === point) {
                classes.push('gomoku-point-last')
              }

              if (winningLine.has(point)) {
                classes.push('gomoku-point-winning')
              }

              return (
                <button
                  key={point}
                  type="button"
                  className={classes.join(' ')}
                  data-point={point}
                  onClick={() => onPointClick(point)}
                >
                  {colIndex > 0 ? <span className="gomoku-point-segment gomoku-point-segment-left" /> : null}
                  {colIndex < row.length - 1 ? (
                    <span className="gomoku-point-segment gomoku-point-segment-right" />
                  ) : null}
                  {rowIndex > 0 ? <span className="gomoku-point-segment gomoku-point-segment-up" /> : null}
                  {rowIndex < board.length - 1 ? (
                    <span className="gomoku-point-segment gomoku-point-segment-down" />
                  ) : null}
                  {STAR_POINTS.has(point) ? <span className="gomoku-star-point" aria-hidden="true" /> : null}
                  {stone ? (
                    <span className={`gomoku-stone gomoku-stone-${stone.side}`} aria-label={`${stone.side} stone`} />
                  ) : null}
                </button>
              )
            }),
          )}
        </div>
      </div>
    </div>
  )
}
