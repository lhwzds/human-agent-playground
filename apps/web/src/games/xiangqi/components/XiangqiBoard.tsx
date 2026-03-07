import { coordinatesToSquare, type Square, type XiangqiBoard } from '@human-agent-playground/game-xiangqi'

interface XiangqiBoardProps {
  board: XiangqiBoard
  selectedSquare: Square | null
  legalTargets: Set<Square>
  onSquareClick: (square: Square) => void
}

export function XiangqiBoard({
  board,
  selectedSquare,
  legalTargets,
  onSquareClick,
}: XiangqiBoardProps) {
  return (
    <div className="board-shell">
      <div className="board-grid" role="grid" aria-label="Xiangqi board">
        {board.map((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const square = coordinatesToSquare(rowIndex, colIndex)
            const isSelected = selectedSquare === square
            const isTarget = legalTargets.has(square)

            return (
              <button
                key={square}
                className={[
                  'board-cell',
                  rowIndex === 4 ? 'board-cell-river-bottom' : '',
                  rowIndex === 5 ? 'board-cell-river-top' : '',
                  isSelected ? 'board-cell-selected' : '',
                  isTarget ? 'board-cell-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                data-square={square}
                onClick={() => onSquareClick(square)}
              >
                <span className={`piece piece-${piece?.side ?? 'empty'}`}>
                  {piece?.display ?? ''}
                </span>
                <span className="cell-label">{square}</span>
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
