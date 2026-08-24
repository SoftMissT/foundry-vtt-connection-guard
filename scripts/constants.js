export const MODULE_ID = 'connection-guard'
export const MODULE_TITLE = 'Connection Guard'
export const SOCKET_EVENT = `module.${MODULE_ID}`

// Nomes de hook — v13 renomeou PlayerList -> Players, mas mantém o alias
// "renderPlayerList" por compatibilidade. Escutamos os dois.
export const PLAYERS_RENDER_HOOKS = ['renderPlayers', 'renderPlayerList']

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
}

export const DEFAULTS = {
  LATENCY_INTERVAL_SECONDS: 20,
  MIN_INTERVAL_SECONDS: 10,
  HISTORY_SIZE: 20,
  DIAGNOSTICS_HISTORY_SIZE: 30,
  RECONNECT_MAX_DELAY_SECONDS: 15,
  MISSED_PINGS_FOR_TIMEOUT: 3,
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
