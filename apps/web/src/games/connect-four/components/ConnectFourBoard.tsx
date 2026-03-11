import {
  coordinatesToPoint,
  type ConnectFourBoard as ConnectFourBoardState,
  type ConnectFourColumn,
  type ConnectFourPoint,
} from '@human-agent-playground/game-connect-four'

interface ConnectFourBoardProps {
  board: ConnectFourBoardState
  lastMovePoint: ConnectFourPoint | null
  winningLine: Set<ConnectFourPoint>
  onColumnClick: (column: ConnectFourColumn) => void
}

export function ConnectFourBoard({
  board,
  lastMovePoint,
  winningLine,
  onColumnClick,
}: ConnectFourBoardProps) {
  return (
    <div className="board-shell connect-four-board-shell">
      <div className="connect-four-layout">
        <div className="connect-four-column-labels" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index + 1} className="board-axis-label">
              {index + 1}
            </span>
          ))}
        </div>

        <div className="connect-four-grid">
          {board.flatMap((row, rowIndex) =>
            row.map((disc, colIndex) => {
              const point = coordinatesToPoint(rowIndex, colIndex)
              const classes = ['connect-four-cell']

              if (lastMovePoint === point) {
                classes.push('connect-four-cell-last')
              }

              if (winningLine.has(point)) {
                classes.push('connect-four-cell-winning')
              }

              return (
                <button
                  key={point}
                  type="button"
                  className={classes.join(' ')}
                  data-point={point}
                  data-column={colIndex + 1}
                  onClick={() => onColumnClick((colIndex + 1) as ConnectFourColumn)}
                >
                  <span className="connect-four-slot" aria-hidden="true" />
                  {disc ? <span className={`connect-four-disc connect-four-disc-${disc.side}`} /> : null}
                </button>
              )
            }),
          )}
        </div>
      </div>
    </div>
  )
}
