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
                  {rowIndex > 0 && rowIndex !== 5 ? (
                    <span className="board-point-segment board-point-segment-up" aria-hidden="true" />
                  ) : null}
                  {rowIndex < board.length - 1 && rowIndex !== 4 ? (
                    <span className="board-point-segment board-point-segment-down" aria-hidden="true" />
                  ) : null}
                  {colIndex > 0 ? (
                    <span className="board-point-segment board-point-segment-left" aria-hidden="true" />
                  ) : null}
                  {colIndex < row.length - 1 ? (
                    <span className="board-point-segment board-point-segment-right" aria-hidden="true" />
                  ) : null}
                  {getPalaceDiagonals(rowIndex, colIndex).map((direction) => (
                    <span
                      key={direction}
                      className={`board-point-diagonal board-point-diagonal-${direction}`}
                      aria-hidden="true"
                    />
                  ))}
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

function getPalaceDiagonals(rowIndex: number, colIndex: number) {
  const topPalaceKey = `${rowIndex}:${colIndex}`
  const bottomPalaceKey = `${rowIndex}:${colIndex}`

  if (topPalaceKey === '0:3') {
    return ['down-right']
  }
  if (topPalaceKey === '0:5') {
    return ['down-left']
  }
  if (topPalaceKey === '1:4') {
    return ['up-left', 'up-right', 'down-left', 'down-right']
  }
  if (topPalaceKey === '2:3') {
    return ['up-right']
  }
  if (topPalaceKey === '2:5') {
    return ['up-left']
  }
  if (bottomPalaceKey === '7:3') {
    return ['down-right']
  }
  if (bottomPalaceKey === '7:5') {
    return ['down-left']
  }
  if (bottomPalaceKey === '8:4') {
    return ['up-left', 'up-right', 'down-left', 'down-right']
  }
  if (bottomPalaceKey === '9:3') {
    return ['up-right']
  }
  if (bottomPalaceKey === '9:5') {
    return ['up-left']
  }

  return []
}
