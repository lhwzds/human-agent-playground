import { coordinatesToSquare, type Square, type XiangqiBoard } from '@human-agent-playground/game-xiangqi'

interface XiangqiBoardProps {
  board: XiangqiBoard
  selectedSquare: Square | null
  legalTargets: Set<Square>
  lastMoveFrom: Square | null
  lastMoveTo: Square | null
  onSquareClick: (square: Square) => void
}

export function XiangqiBoard({
  board,
  selectedSquare,
  legalTargets,
  lastMoveFrom,
  lastMoveTo,
  onSquareClick,
}: XiangqiBoardProps) {
  return (
    <div className="board-shell">
      <div className="board-frame">
        <div className="board-river" aria-hidden="true">
          <span>楚河</span>
          <span>汉界</span>
        </div>
        <div className="board-grid" role="grid" aria-label="Xiangqi board">
          {board.map((row, rowIndex) =>
            row.map((piece, colIndex) => {
              const square = coordinatesToSquare(rowIndex, colIndex)
              const isSelected = selectedSquare === square
              const isTarget = legalTargets.has(square)
              const isLastMoveFrom = lastMoveFrom === square
              const isLastMoveTo = lastMoveTo === square

              return (
                <button
                  key={square}
                  className={[
                    'board-cell',
                    rowIndex === 4 ? 'board-cell-river-bottom' : '',
                    rowIndex === 5 ? 'board-cell-river-top' : '',
                    isSelected ? 'board-cell-selected' : '',
                    isTarget ? 'board-cell-target' : '',
                    isLastMoveFrom ? 'board-cell-last-from' : '',
                    isLastMoveTo ? 'board-cell-last-to' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  type="button"
                  data-square={square}
                  onClick={() => onSquareClick(square)}
                >
                  {rowIndex === 5 ? <span className="board-cell-river-line" aria-hidden="true" /> : null}
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
    </div>
  )
}
