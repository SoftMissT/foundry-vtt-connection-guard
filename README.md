# Connection Guard

Módulo para Foundry VTT (v13+) que monitora, diagnostica e otimiza a conexão de todos os usuários na mesa.

## Recursos

- **Latência em tempo real**: mostra o ping (RTT) de cada usuário ao lado do nome na lista de jogadores, incluindo o GM. Modo compacto opcional (`+`/`-`/`!`) para acessibilidade.
- **Reconexão preditiva**: detecta degradação de RTT _antes_ da queda e alerta o usuário. Quando a queda acontece, reconecta mais rápido e com mais insistência que o padrão do Foundry.
- **Adaptive ping**: mede a latência com mais frequência quando a conexão está ruim e menos quando está estável economiza recursos sem perder resolução no momento que importa.
- **Assistente de serviço do GM**: pergunta qual serviço a mesa usa (Radmin VPN Free, playit.gg, ngrok, Cloudflare Tunnel, LAN, IP direto ou customizado) e mostra somente os campos necessários.
- **Painel de diagnóstico do GM**: tabela com latência, jitter, perda estimada e status de cada usuário. Histórico de quedas com timestamp e duração. Alertas de degradação preditiva.
- **Assistente Radmin VPN Free**: o GM configura o IP virtual `26.x.x.x`, a porta do Foundry e o nome da rota em um dialog box, sem editar JSON. A rota é salva e ativada para a mesa.
- **Journal de testes**: captura eventos de runtime (lifecycle, latência, conexão, degradação, rotas e erros) e exporta como Journal Entry do Foundry em markdown para validar se o módulo está funcionando corretamente.
- **i18n**: português (Brasil) como idioma principal, inglês como fallback.

## Instalação

### Via URL de manifesto (recomendado)

1. No Foundry VTT, vá em **Configurar Jogo → Gerenciar Módulos → Instalar Módulo**.
2. Cole a URL do manifesto:

```text
https://github.com/SoftMissT/foundry-vtt-connection-guard/releases/latest/download/module.json
```

1. Clique em **Instalar**.
2. Ative o módulo em **Configurar Jogo → Gerenciar Módulos**.

### Manual

1. Baixe o `.zip` da [última release](https://github.com/SoftMissT/foundry-vtt-connection-guard/releases).
2. Extraia para `<seu dataPath>/Data/modules/connection-guard/`.
3. Ative o módulo em **Configurar Jogo → Gerenciar Módulos**.

## Configurações

As configurações ficam em **Configurar Jogo → Configurações → Connection Guard**.

| Setting                        | Escopo  | Default | Descrição                                                   |
| ------------------------------ | ------- | ------- | ----------------------------------------------------------- |
| Intervalo de medição           | Mundo   | 20s     | De quanto em quanto tempo cada cliente mede sua latência    |
| Ocultar latência               | Cliente | off     | Some com o badge na lista de jogadores                      |
| Modo compacto                  | Cliente | off     | `+`/`-`/`!` em vez do valor em ms                           |
| Tooltip de diagnóstico         | Cliente | on      | Mostra jitter e perda no hover do badge                     |
| Reconexão agressiva            | Cliente | on      | Backoff mais curto + reconexão forçada ao voltar rede/aba   |
| Atraso máximo entre tentativas | Cliente | 15s     | Teto do backoff exponencial de reconexão                    |
| Histórico de quedas            | Mundo   | 30      | Quantas quedas guardar no painel do GM                      |
| Limiar de degradação           | Mundo   | 300ms   | RTT médio acima deste valor dispara monitoramento preditivo |
| Ciclos para alerta             | Mundo   | 3       | Ciclos consecutivos acima do limiar antes de emitir alerta  |

### Escolher e configurar o serviço de conexão

O assistente fica disponível apenas para o GM em **Configurar Jogo → Configurações → Configurações de Módulos → Connection Guard → Configurar serviço**.

1. Escolha o serviço que o GM realmente está usando: Radmin VPN Free, playit.gg, ngrok, Cloudflare Tunnel, LAN, IP direto ou customizado.
2. Informe os dados solicitados para esse serviço.
3. Clique em **Salvar e ativar rota**.

O módulo salva somente o serviço escolhido, define-o como rota ativa e informa os jogadores. O **Abyss Link Route Oracle** testa exclusivamente essa rota ativa; ele não testa Radmin, ngrok, playit ou Cloudflare que não foram escolhidos.

Para Radmin VPN Free, cada jogador precisa instalar o Radmin VPN, entrar no mesmo grupo do GM e liberar a porta do Foundry no firewall. O módulo não instala aplicativos nem altera o firewall do sistema operacional.

### Voz no Discord

STUN/TURN foi removido do Connection Guard. Essas tecnologias pertencem ao WebRTC de voz/vídeo interno do Foundry. Se a mesa usa Discord, o Discord já fornece sua própria infraestrutura de voz e o GM não precisa configurar STUN ou TURN neste módulo.

## Como usar

### Ver latência

O badge aparece automaticamente ao lado do nome de cada usuário na lista de jogadores. Cores:

- 🟢 Verde: bom (≤100ms)
- 🟡 Amarelo: regular (100-250ms)
- 🔴 Vermelho: ruim (≥250ms)
- ⚠ Vermelho: sem resposta há vários ciclos

### Exportar journal de testes

1. Abra **Configurar Jogo → Configurações → Connection Guard → Painel de Diagnóstico (GM)**.
2. Veja o contador de entradas registradas.
3. Clique em **Exportar Journal**.
4. Uma Journal Entry é criada (ou atualizada) com o histórico completo em markdown.
5. A Journal Entry abre automaticamente para revisão.

## O que "melhorar a conexão" significa aqui

O Foundry VTT é cliente-servidor: o navegador de cada jogador fala com **um** servidor (o do GM) via WebSocket. Não existe "escolher a melhor rota" entre servidores só existe um destino possível. Dentro dessa realidade, o módulo faz o que é tecnicamente possível:

| Problema              | O que o módulo faz                                                   |
| --------------------- | -------------------------------------------------------------------- |
| Latência desconhecida | Mede RTT de cada cliente e mostra na lista de jogadores              |
| Quedas silenciosas    | Banner visual + reconexão forçada ao detectar rede/aba ativa         |
| Queda iminente        | Detecção preditiva: RTT > limiar por N ciclos → alerta antes de cair |
| Reconexão lenta       | Backoff do Socket.IO ajustado para tentar mais rápido e não desistir |
| Medição fixa          | Adaptive interval: mais frequente quando ruim, menos quando estável  |
| Sem diagnóstico       | Painel do GM + journal exportável com histórico completo             |

## Estrutura do código

```text
scripts/
  constants.js           IDs, nomes de evento, defaults, tipos de journal e serviços de rota
  settings.js            registro de settings e menus
  latency-monitor.js     mede RTT, jitter, perda + adaptive interval + detecção preditiva
  diagnostics.js         store em memória: estado por usuário, quedas, alertas de degradação
  reconnect-manager.js   backoff Socket.IO + reconexão forçada + banner
  service-wizard.js      seleção do serviço e configuração guiada pelo GM
  player-list-ui.js      badge de latência na lista de jogadores
  gm-panel.js            painel do GM (DialogV2) + botão Exportar Journal
  service-wizard.js      assistente DialogV2 para escolher e configurar o serviço
  journal-logger.js      captura eventos + gera markdown + cria Journal Entry
  main.js                entry point orquestra tudo nos hooks init/ready
lang/
  pt-BR.json             tradução principal
  en.json                fallback
styles/
  connection-guard.css   badges, banner, painel, journal
```

Sem etapa de build: JavaScript ES Module puro, carregado direto pelo Foundry via `esmodules` no `module.json`.

## Origem e créditos

Baseado conceitualmente em [`foundry-user-latency`](https://github.com/mawburn/foundry-user-latency) de **mawburn**. Código reescrito do zero em ES Modules para v13+, mantendo a técnica de medição (`game.time.sync()`) e adicionando reconexão preditiva, adaptive ping, configuração guiada de rotas e journal de testes.

Licenciado sob **GPL-3.0** veja `LICENSE`.

## Compatibilidade

- **Mínimo**: Foundry VTT v13
- **Verificado**: v14.999
- **Sem `maximum` fixo**: compatível com versões futuras até que uma mudança de API quebre algo (o Foundry avisa o GM antes de ativar se houver incompatibilidade)
- **Sem dependências**: não requer outros módulos
- **Sistemas**: funciona com qualquer sistema (não usa dados de Actor/Item)
