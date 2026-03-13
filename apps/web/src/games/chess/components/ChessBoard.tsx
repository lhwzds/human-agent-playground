import {
  coordinatesToSquare,
  type ChessBoard as ChessBoardState,
  type ChessSquare,
} from '@human-agent-playground/game-chess'

interface ChessBoardProps {
  board: ChessBoardState
  selectedSquare: ChessSquare | null
  legalTargets: Set<ChessSquare>
  lastMoveFrom: ChessSquare | null
  lastMoveTo: ChessSquare | null
  onSquareClick: (square: ChessSquare) => void
}

export function ChessBoard({
  board,
  selectedSquare,
  legalTargets,
  lastMoveFrom,
  lastMoveTo,
  onSquareClick,
}: ChessBoardProps) {
  return (
    <div className="board-shell chess-board-shell">
      <div className="chess-layout">
        <div className="chess-top-spacer" aria-hidden="true" />
        <div className="chess-file-labels" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="board-axis-label">
              {String.fromCharCode(97 + index)}
            </span>
          ))}
        </div>

        <div className="chess-rank-labels" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <span key={index} className="board-axis-label">
              {8 - index}
            </span>
          ))}
        </div>

        <div className="chess-grid">
          {board.flatMap((row, rowIndex) =>
            row.map((piece, colIndex) => {
              const square = coordinatesToSquare(rowIndex, colIndex)
              const classes = ['chess-square']

              classes.push((rowIndex + colIndex) % 2 === 0 ? 'chess-square-light' : 'chess-square-dark')

              if (selectedSquare === square) {
                classes.push('chess-square-selected')
              }

              if (legalTargets.has(square)) {
                classes.push('chess-square-target')
              }

              if (lastMoveFrom === square) {
                classes.push('chess-square-last-from')
              }

              if (lastMoveTo === square) {
                classes.push('chess-square-last-to')
              }

              return (
                <button
                  key={square}
                  type="button"
                  className={classes.join(' ')}
                  data-square={square}
                  onClick={() => onSquareClick(square)}
                >
                  {piece ? <span className={`chess-piece chess-piece-${piece.side}`}>{piece.display}</span> : null}
                  {!piece && legalTargets.has(square) ? <span className="chess-target-marker" aria-hidden="true" /> : null}
                </button>
              )
            }),
          )}
        </div>
      </div>
    </div>
  )
}
