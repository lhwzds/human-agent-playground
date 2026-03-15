import type { SessionEvent } from '@human-agent-playground/core'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type AppLanguage = 'en' | 'zh-CN'

type TranslationValues = Record<string, number | string>

const LANGUAGE_STORAGE_KEY = 'human-agent-playground-language'

const translations = {
  en: {
    'hero.heading': 'Shared Tabletop Sessions For Humans And Agents',
    'hero.copy':
      'One UI, one MCP endpoint, one session store. Games live in isolated folders, while the platform lets humans and agents operate on the same match state and watch each move land in real time.',
    'hero.error': 'Error',
    'toolbar.aria': 'Session controls',
    'toolbar.game': 'Game',
    'toolbar.language': 'Language',
    'toolbar.session': 'Session',
    'toolbar.noSessions': 'No sessions',
    'toolbar.createSession': 'Create Session',
    'toolbar.refresh': 'Refresh',
    'toolbar.reset': 'Reset',
    'toolbar.language.en': 'English',
    'toolbar.language.zh-CN': '中文',
    'meta.game': 'Game',
    'meta.sync': 'Sync',
    'meta.turn': 'Turn',
    'meta.status': 'Status',
    'meta.winner': 'Winner',
    'meta.check': 'Check',
    'meta.checkActive': 'active',
    'workspace.loading': 'Loading board…',
    'workspace.noSession': 'No session loaded. Create one from the header bar.',
    'workspace.noRenderer': 'No renderer is registered for {gameId}.',
    'modal.gameOverTitle': 'Game Over',
    'modal.gameOverSummary': '{gameName} is finished.',
    'modal.gameOverWinner': 'Winner: {winner}',
    'modal.gameOverDraw': 'The game ended in a draw.',
    'modal.gameOverPrompt': 'Do you want to restart this session?',
    'modal.gameOverRestart': 'Restart',
    'modal.gameOverKeep': 'Keep Board',
    'feed.title': 'Message Feed',
    'feed.empty': 'No session events yet.',
    'feed.sessionCreated': 'Session Created',
    'feed.sessionReset': 'Session Reset',
    'feed.reasoningSummary': 'Reasoning Summary',
    'feed.confidence': 'Confidence: {value}',
    'event.created': 'Created a new {gameName} session.',
    'event.reset': 'Reset the {gameName} session to the opening position.',
    'event.move.point': '{side} played {point}.',
    'event.move.route': '{side} played {from} -> {to}.',
    'actor.human': 'Human',
    'actor.agent': 'Agent',
    'actor.system': 'System',
    'actor.unknown': 'Unknown',
    'actor.via': '{actor} via {channel}',
    'sync.connecting': 'connecting',
    'sync.live': 'live',
    'sync.reconnecting': 'reconnecting',
    'sync.offline': 'offline',
    'status.active': 'active',
    'status.finished': 'finished',
    'winner.none': 'none',
    'winner.draw': 'draw',
    'side.red': 'red',
    'side.yellow': 'yellow',
    'side.black': 'black',
    'side.white': 'white',
    'game.xiangqi': 'Xiangqi',
    'game.chess': 'Chess',
    'game.gomoku': 'Gomoku',
    'game.connect-four': 'Connect Four',
    'game.othello': 'Othello',
    'move.gomoku.placed': 'Placed {stone}',
    'move.xiangqi.capture': '{piece} captured {captured}',
    'move.connectFour.dropped': 'Dropped {side} disc in column {column}{pointSuffix}',
    'move.othello.placed': 'Placed {stone}',
    'move.othello.flipped': 'Placed {stone} and flipped {count} disc{suffix}: {points}',
  },
  'zh-CN': {
    'hero.heading': '供人类与智能体共享的棋盘对局',
    'hero.copy':
      '一个 UI、一个 MCP 端点、一个 session 存储。每个游戏独立实现，而平台负责让人类与智能体在同一局里同步操作，并实时看到每一步落下。',
    'hero.error': '错误',
    'toolbar.aria': '对局控制',
    'toolbar.game': '游戏',
    'toolbar.language': '语言',
    'toolbar.session': '会话',
    'toolbar.noSessions': '暂无对局',
    'toolbar.createSession': '创建对局',
    'toolbar.refresh': '刷新',
    'toolbar.reset': '重置',
    'toolbar.language.en': 'English',
    'toolbar.language.zh-CN': '中文',
    'meta.game': '游戏',
    'meta.sync': '同步',
    'meta.turn': '当前行棋',
    'meta.status': '状态',
    'meta.winner': '胜者',
    'meta.check': '将军',
    'meta.checkActive': '是',
    'workspace.loading': '正在加载棋盘…',
    'workspace.noSession': '当前没有加载对局。请先从顶部创建一个。',
    'workspace.noRenderer': '{gameId} 暂无已注册的前端渲染器。',
    'modal.gameOverTitle': '对局结束',
    'modal.gameOverSummary': '{gameName} 已结束。',
    'modal.gameOverWinner': '胜者：{winner}',
    'modal.gameOverDraw': '本局以平局结束。',
    'modal.gameOverPrompt': '要立即重开这一局吗？',
    'modal.gameOverRestart': '重新开始',
    'modal.gameOverKeep': '保留终局',
    'feed.title': '消息流',
    'feed.empty': '当前还没有对局事件。',
    'feed.sessionCreated': '已创建对局',
    'feed.sessionReset': '已重置对局',
    'feed.reasoningSummary': '思考摘要',
    'feed.confidence': '置信度：{value}',
    'event.created': '已创建新的 {gameName} 对局。',
    'event.reset': '已将 {gameName} 对局重置为开局。',
    'event.move.point': '{side} 落子 {point}。',
    'event.move.route': '{side} 走子 {from} -> {to}。',
    'actor.human': '人类',
    'actor.agent': '智能体',
    'actor.system': '系统',
    'actor.unknown': '未知来源',
    'actor.via': '{actor} · {channel}',
    'sync.connecting': '连接中',
    'sync.live': '实时同步',
    'sync.reconnecting': '重连中',
    'sync.offline': '离线',
    'status.active': '进行中',
    'status.finished': '已结束',
    'winner.none': '无',
    'winner.draw': '平局',
    'side.red': '红方',
    'side.yellow': '黄方',
    'side.black': '黑方',
    'side.white': '白方',
    'game.xiangqi': '象棋',
    'game.chess': '国际象棋',
    'game.gomoku': '五子棋',
    'game.connect-four': '四子棋',
    'game.othello': '黑白棋',
    'move.gomoku.placed': '落下 {stone}',
    'move.xiangqi.capture': '{piece} 吃 {captured}',
    'move.connectFour.dropped': '{side} 在第 {column} 列落子{pointSuffix}',
    'move.othello.placed': '落下 {stone}',
    'move.othello.flipped': '落下 {stone}，翻转 {count} 枚棋子：{points}',
  },
} as const

interface I18nContextValue {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: keyof (typeof translations)['en'], values?: TranslationValues) => string
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage() {},
  t(key, values) {
    return interpolate(translations.en[key], values)
  },
})

function interpolate(template: string, values?: TranslationValues) {
  if (!values) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? ''))
}

function readInitialLanguage(): AppLanguage {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const stored =
    typeof window.localStorage?.getItem === 'function'
      ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      : null
  if (stored === 'en' || stored === 'zh-CN') {
    return stored
  }

  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(readInitialLanguage)

  useEffect(() => {
    window.localStorage?.setItem?.(LANGUAGE_STORAGE_KEY, language)
  }, [language])

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t(key, values) {
        return interpolate(translations[language][key], values)
      },
    }),
    [language],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

export function resetLanguagePreferenceForTests() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage?.removeItem?.(LANGUAGE_STORAGE_KEY)
}

export function getGameLabel(language: AppLanguage, gameId: string, fallback?: string) {
  const key = `game.${gameId}` as keyof (typeof translations)['en']
  return translations[language][key] ?? fallback ?? gameId
}

export function getSideLabel(language: AppLanguage, side: string | null | undefined) {
  if (!side) {
    return translations[language]['actor.unknown']
  }

  const key = `side.${side}` as keyof (typeof translations)['en']
  return translations[language][key] ?? side
}

export function getStatusLabel(language: AppLanguage, status: string | null | undefined) {
  if (!status) {
    return translations[language]['winner.none']
  }

  const key = `status.${status}` as keyof (typeof translations)['en']
  return translations[language][key] ?? status
}

export function getWinnerLabel(language: AppLanguage, winner: string | null | undefined) {
  if (!winner || winner === 'none') {
    return translations[language]['winner.none']
  }

  if (winner === 'draw') {
    return translations[language]['winner.draw']
  }

  return getSideLabel(language, winner)
}

export function getSyncStateLabel(language: AppLanguage, state: string) {
  const key = `sync.${state}` as keyof (typeof translations)['en']
  return translations[language][key] ?? state
}

export function formatActorLabel(language: AppLanguage, event: SessionEvent) {
  const actor =
    event.actorName ??
    translations[language][
      `actor.${event.actorKind}` as keyof (typeof translations)['en']
    ] ??
    translations[language]['actor.unknown']

  return interpolate(translations[language]['actor.via'], {
    actor,
    channel: event.channel,
  })
}

export function formatTimestamp(language: AppLanguage, timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.valueOf())) {
    return timestamp
  }

  return date.toLocaleTimeString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatEventHeadline(language: AppLanguage, event: SessionEvent) {
  if (
    event.kind === 'move_played' &&
    typeof event.details.from === 'string' &&
    typeof event.details.to === 'string'
  ) {
    return `${event.details.from} → ${event.details.to}`
  }

  if (event.kind === 'move_played' && typeof event.details.point === 'string') {
    return event.details.point
  }

  if (event.kind === 'session_created') {
    return translations[language]['feed.sessionCreated']
  }

  if (event.kind === 'session_reset') {
    return translations[language]['feed.sessionReset']
  }

  return event.summary
}

export function formatEventSummary(
  language: AppLanguage,
  event: SessionEvent,
  fallbackGameId?: string,
) {
  if (event.kind === 'session_created') {
    const gameId =
      typeof event.details.gameId === 'string' ? event.details.gameId : fallbackGameId ?? 'xiangqi'

    return interpolate(translations[language]['event.created'], {
      gameName: getGameLabel(language, gameId, gameId),
    })
  }

  if (event.kind === 'session_reset') {
    return interpolate(translations[language]['event.reset'], {
      gameName: getGameLabel(language, fallbackGameId ?? 'xiangqi', fallbackGameId ?? 'xiangqi'),
    })
  }

  if (event.kind === 'move_played') {
    const side = getSideLabel(language, typeof event.details.side === 'string' ? event.details.side : null)
    if (typeof event.details.point === 'string') {
      return interpolate(translations[language]['event.move.point'], {
        side,
        point: event.details.point,
      })
    }

    return interpolate(translations[language]['event.move.route'], {
      side,
      from: typeof event.details.from === 'string' ? event.details.from : 'unknown',
      to: typeof event.details.to === 'string' ? event.details.to : 'unknown',
    })
  }

  return event.summary
}
