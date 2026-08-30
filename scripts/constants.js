export const MODULE_ID = 'connection-guard'
export const MODULE_TITLE = 'Connection Guard: Abyss Link'
export const SOCKET_EVENT = `module.${MODULE_ID}`

// Nomes de hook — v13 renomeou PlayerList -> Players, mas mantém o alias
// "renderPlayerList" por compatibilidade. Escutamos os dois.
export const PLAYERS_RENDER_HOOKS = ['renderPlayers', 'renderPlayerList']

export const SOCKET_MESSAGES = {
  LATENCY_SAMPLE: 'latency-sample',
  ROUTE_SCAN_RESULT: 'route-scan-result',
}

export const SETTINGS = {
  LATENCY_INTERVAL: 'latencyInterval',
  HIDE_LATENCY: 'hideLatency',
  MICRO_LATENCY: 'microLatency',
  SHOW_DIAGNOSTICS_TOOLTIP: 'showDiagnosticsTooltip',
  AUTO_RECONNECT: 'autoReconnect',
  RECONNECT_MAX_DELAY: 'reconnectMaxDelay',
  DIAGNOSTICS_HISTORY_SIZE: 'diagnosticsHistorySize',
  GM_PANEL_MENU: 'gmPanelMenu',
  WEBRTC_ADVISOR_MENU: 'webrtcAdvisorMenu',
  ROUTE_ORACLE_MENU: 'routeOracleMenu',
  DEGRADATION_THRESHOLD: 'degradationThreshold',
  DEGRADATION_CYCLES: 'degradationCycles',
  CUSTOM_STUN_SERVERS: 'customStunServers',
  TURN_CREDENTIALS: 'turnCredentials',
  ABYSS_THEME: 'abyssTheme',
  ROUTE_PROFILES: 'routeProfiles',
  ROUTE_SCAN_TIMEOUT: 'routeScanTimeout',
}

export const ROUTE_TYPES = {
  LOCAL: 'local',
  RADMIN: 'radmin',
  CLOUDFLARE: 'cloudflare',
  PLAYIT: 'playit',
  DIRECT: 'direct',
  CUSTOM: 'custom',
}

export const JOURNAL_TYPES = {
  LIFECYCLE: 'lifecycle',
  LATENCY: 'latency',
  CONNECTION: 'connection',
  STALE: 'stale',
  WEBRTC: 'webrtc',
  DEGRADATION: 'degradation',
  ROUTE: 'route',
  ERROR: 'error',
}

export const DEFAULTS = {
  LATENCY_INTERVAL_SECONDS: 20,
  MIN_INTERVAL_SECONDS: 10,
  HISTORY_SIZE: 20,
  DIAGNOSTICS_HISTORY_SIZE: 30,
  RECONNECT_MAX_DELAY_SECONDS: 15,
  MISSED_PINGS_FOR_TIMEOUT: 3,
  DEGRADATION_THRESHOLD_MS: 300,
  DEGRADATION_CYCLES: 3,
  ADAPTIVE_MIN_INTERVAL_MS: 10000,
  ADAPTIVE_MAX_INTERVAL_MS: 90000,
  ADAPTIVE_GOOD_MULTIPLIER: 1.5,
  ADAPTIVE_BAD_MULTIPLIER: 0.5,
  ADAPTIVE_GOOD_THRESHOLD_MS: 100,
  ADAPTIVE_BAD_THRESHOLD_MS: 250,
  JOURNAL_AUTO_EXPORT_ENTRIES: 50,
  JOURNAL_AUTO_EXPORT_INTERVAL_MS: 300000, // 5 minutes
  ROUTE_SCAN_TIMEOUT_MS: 2500,
  ROUTE_SCAN_ATTEMPTS: 3,
}

// Servidores STUN públicos conhecidos, usados apenas para BENCHMARK local
// (tempo até o primeiro candidato ICE srflx). Nunca enviam nem recebem
// mídia — servem só para medir tempo de resposta do servidor de STUN.
export const PUBLIC_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:stun.nextcloud.com:443',
  'stun:stun.stunprotocol.org:3478',
  'stun:stun.sipgate.net:3478',
]
