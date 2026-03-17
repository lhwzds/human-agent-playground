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
    'toolbar.aiSettings': 'AI Settings',
    'toolbar.language.en': 'English',
    'toolbar.language.zh-CN': '中文',
    'meta.game': 'Game',
    'meta.sync': 'Sync',
    'meta.turn': 'Turn',
    'meta.status': 'Status',
    'meta.winner': 'Winner',
    'meta.check': 'Check',
    'meta.checkActive': 'active',
    'ai.title': 'AI Runtime',
    'ai.subtitle': 'Configure bridge providers, auth profiles, and per-seat autoplay.',
    'ai.refresh': 'Refresh AI Data',
    'ai.providers': 'Providers',
    'ai.profiles': 'Auth Profiles',
    'ai.seats': 'Seat Assignment',
    'ai.noSession': 'Create or select a session to configure AI seats.',
    'ai.unavailable': 'AI runtime is unavailable.',
    'ai.loading': 'Loading AI runtime…',
    'ai.provider.status': 'Status: {status}',
    'ai.provider.kind.api': 'API',
    'ai.provider.kind.cli': 'CLI',
    'ai.provider.ready': 'ready',
    'ai.provider.notLoggedIn': 'not signed in',
    'ai.provider.missingCommand': 'missing command',
    'ai.provider.missing': 'missing',
    'ai.profile.name': 'Profile Name',
    'ai.profile.provider': 'Provider',
    'ai.profile.credentialType': 'Credential Type',
    'ai.profile.credentialValue': 'Credential Value',
    'ai.profile.email': 'Email (optional)',
    'ai.profile.create': 'Create Profile',
    'ai.profile.empty': 'No auth profiles yet.',
    'ai.profile.test': 'Test',
    'ai.profile.delete': 'Delete',
    'ai.profile.disable': 'Disable',
    'ai.profile.enable': 'Enable',
    'ai.profile.health': 'Health: {health}',
    'ai.profile.masked': 'Credential: {value}',
    'ai.seat.enabled': 'Enabled',
    'ai.seat.autoPlay': 'Autoplay',
    'ai.seat.model': 'Model',
    'ai.seat.profile': 'Profile',
    'ai.seat.timeout': 'Timeout (ms)',
    'ai.seat.prompt': 'Prompt Override',
    'ai.seat.save': 'Save Seat',
    'ai.seat.none': 'No profile',
    'ai.seat.status': 'Seat status: {status}',
    'ai.seat.error': 'Last error: {error}',
    'ai.seat.runtime': 'Runtime: {runtime}',
    'ai.launcher': 'Launcher',
    'ai.start': 'Start',
    'ai.stop': 'Stop',
    'ai.restart': 'Restart AI',
    'ai.restarting': 'Restarting…',
    'ai.advanced': 'Advanced',
    'ai.connectionMode': 'Connection Mode',
    'ai.defaultModel': 'Default Model',
    'ai.settings.save': 'Save Settings',
    'ai.cliHint': 'This launcher uses local CLI availability and does not require an API key here.',
    'ai.notice.saved': 'Saved settings for {provider}.',
    'ai.notice.testReady': '{provider} is ready.',
    'ai.notice.cliNotLoggedIn': '{provider} is installed, but you are not signed in yet.',
    'ai.activity.thinking': '{side} · {launcher} is thinking…',
    'ai.status.idle': 'idle',
    'ai.status.thinking': 'thinking',
    'ai.status.waiting': 'waiting',
    'ai.status.errored': 'errored',
    'ai.authProvider.openai': 'OpenAI API',
    'ai.authProvider.anthropic': 'Anthropic API',
    'ai.authProvider.google': 'Google / Gemini API',
    'ai.authProvider.openai_codex': 'Codex CLI',
    'ai.authProvider.claude_code': 'Claude Code',
    'players.title': 'Players',
    'players.edit': 'Edit Players',
    'players.createTitle': 'Create Session',
    'players.editTitle': 'Edit Players',
    'players.createCopy': 'Choose who controls each side before the session starts.',
    'players.editCopy': 'Adjust who controls each side for the current session.',
    'players.createAction': 'Create',
    'players.saveAction': 'Save Players',
    'players.cancel': 'Cancel',
    'players.useDefaultModel': 'Use provider default',
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
    'modal.close': 'Close',
    'feed.title': 'Message Feed',
    'feed.empty': 'No session events yet.',
    'feed.sessionCreated': 'Session Created',
    'feed.sessionReset': 'Session Reset',
    'feed.reasoningSummary': 'Reasoning Summary',
    'feed.confidence': 'Confidence: {value}',
    'feed.runtimeMeta': '{runtime} · {side} · {provider} / {model}',
    'feed.runtimeMetaNoSide': '{runtime} · {provider} / {model}',
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
    'toolbar.aiSettings': 'AI 设置',
    'toolbar.language.en': 'English',
    'toolbar.language.zh-CN': '中文',
    'meta.game': '游戏',
    'meta.sync': '同步',
    'meta.turn': '当前行棋',
    'meta.status': '状态',
    'meta.winner': '胜者',
    'meta.check': '将军',
    'meta.checkActive': '是',
    'ai.title': 'AI 运行时',
    'ai.subtitle': '配置 bridge provider、认证 profile，以及每个座位的自动应手。',
    'ai.refresh': '刷新 AI 数据',
    'ai.providers': 'Provider 列表',
    'ai.profiles': '认证 Profile',
    'ai.seats': '座位绑定',
    'ai.noSession': '请先创建或选择一局，再配置 AI 座位。',
    'ai.unavailable': 'AI runtime 当前不可用。',
    'ai.loading': '正在加载 AI runtime…',
    'ai.provider.status': '状态：{status}',
    'ai.provider.kind.api': 'API',
    'ai.provider.kind.cli': 'CLI',
    'ai.provider.ready': '可用',
    'ai.provider.notLoggedIn': '未登录',
    'ai.provider.missingCommand': '未安装命令',
    'ai.provider.missing': '缺失',
    'ai.profile.name': 'Profile 名称',
    'ai.profile.provider': 'Provider',
    'ai.profile.credentialType': '凭证类型',
    'ai.profile.credentialValue': '凭证内容',
    'ai.profile.email': '邮箱（可选）',
    'ai.profile.create': '创建 Profile',
    'ai.profile.empty': '当前还没有认证 Profile。',
    'ai.profile.test': '测试',
    'ai.profile.delete': '删除',
    'ai.profile.disable': '禁用',
    'ai.profile.enable': '启用',
    'ai.profile.health': '健康状态：{health}',
    'ai.profile.masked': '凭证：{value}',
    'ai.seat.enabled': '启用',
    'ai.seat.autoPlay': '自动应手',
    'ai.seat.model': '模型',
    'ai.seat.profile': 'Profile',
    'ai.seat.timeout': '超时（毫秒）',
    'ai.seat.prompt': '附加提示词',
    'ai.seat.save': '保存座位配置',
    'ai.seat.none': '不使用 Profile',
    'ai.seat.status': '座位状态：{status}',
    'ai.seat.error': '最近错误：{error}',
    'ai.seat.runtime': '运行时：{runtime}',
    'ai.launcher': '启动器',
    'ai.start': '启动',
    'ai.stop': '停止',
    'ai.restart': '重新启动 AI',
    'ai.restarting': '正在重启…',
    'ai.advanced': '高级选项',
    'ai.connectionMode': '连接方式',
    'ai.defaultModel': '默认模型',
    'ai.settings.save': '保存设置',
    'ai.cliHint': '这个启动器依赖本机 CLI 可用性，这里不需要输入 API Key。',
    'ai.notice.saved': '已保存 {provider} 的设置。',
    'ai.notice.testReady': '{provider} 已就绪。',
    'ai.notice.cliNotLoggedIn': '{provider} 已安装，但当前还没有登录。',
    'ai.activity.thinking': '{side} · {launcher} 正在思考…',
    'ai.status.idle': '空闲',
    'ai.status.thinking': '思考中',
    'ai.status.waiting': '等待中',
    'ai.status.errored': '已出错',
    'ai.authProvider.openai': 'OpenAI API',
    'ai.authProvider.anthropic': 'Anthropic API',
    'ai.authProvider.google': 'Google / Gemini API',
    'ai.authProvider.openai_codex': 'Codex CLI',
    'ai.authProvider.claude_code': 'Claude Code',
    'players.title': '玩家',
    'players.edit': '编辑玩家',
    'players.createTitle': '创建对局',
    'players.editTitle': '编辑玩家',
    'players.createCopy': '在开局前先选择每一方由谁来下。',
    'players.editCopy': '调整当前这局每一方的控制方式。',
    'players.createAction': '创建',
    'players.saveAction': '保存玩家设置',
    'players.cancel': '取消',
    'players.useDefaultModel': '使用 provider 默认模型',
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
    'modal.close': '关闭',
    'feed.title': '消息流',
    'feed.empty': '当前还没有对局事件。',
    'feed.sessionCreated': '已创建对局',
    'feed.sessionReset': '已重置对局',
    'feed.reasoningSummary': '思考摘要',
    'feed.confidence': '置信度：{value}',
    'feed.runtimeMeta': '{runtime} · {side} · {provider} / {model}',
    'feed.runtimeMetaNoSide': '{runtime} · {provider} / {model}',
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

export function getAiSeatStatusLabel(language: AppLanguage, status: string | null | undefined) {
  const key = `ai.status.${status ?? 'idle'}` as keyof (typeof translations)['en']
  return translations[language][key] ?? status ?? translations[language]['ai.status.idle']
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

export function formatRuntimeMeta(language: AppLanguage, event: SessionEvent) {
  const provider = typeof event.details.provider === 'string' ? event.details.provider : null
  const model = typeof event.details.model === 'string' ? event.details.model : null
  const runtime =
    typeof event.details.runtimeSource === 'string' ? event.details.runtimeSource : null
  if (!provider || !model || !runtime) {
    return null
  }

  const side =
    typeof event.details.seatSide === 'string'
      ? getSideLabel(language, event.details.seatSide)
      : null

  if (side) {
    return interpolate(translations[language]['feed.runtimeMeta'], {
      runtime,
      side,
      provider,
      model,
    })
  }

  return interpolate(translations[language]['feed.runtimeMetaNoSide'], {
    runtime,
    provider,
    model,
  })
}
