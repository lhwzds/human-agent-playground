import {
  coordinatesToPoint,
  type OthelloBoard as OthelloBoardState,
  type OthelloPoint,
} from '@human-agent-playground/game-othello'

interface OthelloBoardProps {
  board: OthelloBoardState
  legalMoves: Set<OthelloPoint>
  lastMovePoint: OthelloPoint | null
  onPointClick: (point: OthelloPoint) => void
}

export function OthelloBoard({
  board,
  legalMoves,
  lastMovePoint,
  onPointClick,
}: OthelloBoardProps) {
  return (
    <div className="board-shell othello-board-shell">
      <div className="othello-layout">
        <div className="othello-top-spacer" aria-hidden="true" />
        <div className="othello-file-labels" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="board-axis-label">
              {String.fromCharCode(97 + index)}
            </span>
          ))}
        </div>

        <div className="othello-rank-labels" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="board-axis-label">
              {8 - index}
            </span>
          ))}
        </div>

        <div className="othello-grid">
          {board.flatMap((row, rowIndex) =>
            row.map((disc, colIndex) => {
              const point = coordinatesToPoint(rowIndex, colIndex)
              const classes = ['othello-cell']

              if (lastMovePoint === point) {
                classes.push('othello-cell-last')
              }

              return (
                <button
                  key={point}
                  type="button"
                  className={classes.join(' ')}
                  data-point={point}
                  onClick={() => onPointClick(point)}
                >
                  {disc ? <span className={`othello-disc othello-disc-${disc.side}`} /> : null}
                  {!disc && legalMoves.has(point) ? <span className="othello-legal-marker" aria-hidden="true" /> : null}
                </button>
              )
            }),
          )}
        </div>
      </div>
    </div>
  )
}
