import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react'

export function calculateBoardViewportSize(
  availableWidth: number,
  availableHeight: number,
  shellAspectRatio: number,
) {
  const safeWidth = Math.max(0, availableWidth)
  const safeHeight = Math.max(0, availableHeight)
  const safeAspectRatio = Number.isFinite(shellAspectRatio) && shellAspectRatio > 0 ? shellAspectRatio : 1

  return Math.max(0, Math.min(safeWidth, safeHeight * safeAspectRatio))
}

export function useBoardViewport(shellAspectRatio: number) {
  const boardPanelRef = useRef<HTMLElement | null>(null)
  const [maxInlineSize, setMaxInlineSize] = useState<string>()

  useLayoutEffect(() => {
    const panel = boardPanelRef.current
    if (!panel || typeof window === 'undefined') {
      return
    }

    const updateSize = () => {
      const styles = window.getComputedStyle(panel)
      const innerWidth =
        panel.clientWidth -
        Number.parseFloat(styles.paddingLeft) -
        Number.parseFloat(styles.paddingRight)
      const innerHeight =
        panel.clientHeight -
        Number.parseFloat(styles.paddingTop) -
        Number.parseFloat(styles.paddingBottom)
      const nextSize = calculateBoardViewportSize(innerWidth, innerHeight, shellAspectRatio)
      const nextValue = nextSize > 0 ? `${Math.floor(nextSize)}px` : undefined

      setMaxInlineSize((currentValue) => (currentValue === nextValue ? currentValue : nextValue))
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => {
        window.removeEventListener('resize', updateSize)
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      updateSize()
    })

    resizeObserver.observe(panel)

    return () => {
      resizeObserver.disconnect()
    }
  }, [shellAspectRatio])

  const boardPanelStyle = useMemo(() => {
    if (!maxInlineSize) {
      return undefined
    }

    return {
      '--board-shell-max-inline-size': maxInlineSize,
    } as CSSProperties
  }, [maxInlineSize])

  return {
    boardPanelRef,
    boardPanelStyle,
  }
}
