# Connection Guard

Módulo para Foundry VTT (v13+) que:

- Mostra a latência (ms) de **todos** os usuários conectados, incluindo o GM, ao lado do nome na lista de jogadores.
- Estima **jitter** (variação da latência) e **perda de pacotes** por ciclos de medição perdidos.
- Marca automaticamente quem está "sem resposta" há tempo demais.
- Tenta **reconectar mais rápido e com mais insistência** quando a conexão com o servidor cai, e mostra um aviso na tela enquanto isso acontece.
- Tem um **painel de diagnóstico** para o GM com o histórico de quedas e o status de todos os jogadores.
- Tem um **assistente de servidor de voz/vídeo** que testa servidores STUN públicos a partir do seu navegador e recomenda o mais rápido para colar em Configurar Áudio/Vídeo.

## Origem e créditos

Este módulo nasceu como uma reescrita e expansão de [`foundry-user-latency`](https://github.com/mawburn/foundry-user-latency), de **mawburn**, que fazia só a parte de mostrar a latência (e está sem manutenção desde que o autor abriu [um pedido](https://github.com/foundryvtt/foundryvtt/issues/11132) para isso virar recurso nativo do Foundry). O código foi reescrito do zero em JavaScript puro (ES Modules nativos, sem etapa de build) para v13+, mantendo a mesma técnica de medição (`game.time.sync()`), e adicionando diagnóstico, reconexão e o assistente de WebRTC.

Licenciado sob **GPL-3.0**, a mesma licença do projeto original — veja `LICENSE`.

## Instalação

1. Copie a pasta `connection-guard` inteira para `Data/modules/` da sua instalação Foundry (ou dentro do seu `dataPath`, subpasta `modules`).
2. Ative o módulo em **Configurar Jogo → Gerenciar Módulos**.
3. Configurações ficam em **Configurar Jogo → Configurações → Connection Guard**.

Se você for hospedar isso num repositório Git para instalar por URL de manifesto, preencha os campos `url`, `manifest` e `download` do `module.json` com os links do seu repositório/release antes de publicar — eles estão vazios de propósito porque ainda não existe um repositório.

## O que "melhorar a conexão" significa aqui (e o que não dá pra fazer)

O Foundry é cliente-servidor: o navegador de cada jogador fala só com **um** servidor (o do GM), via WebSocket. Não existe "escolher a melhor rota" entre servidores, como um matchmaking de jogo online faria — só existe um destino possível. Dentro dessa realidade, o módulo faz o que é tecnicamente possível:

- **Reconexão**: ajusta os parâmetros de reconexão do Socket.IO (a biblioteca que o Foundry já usa por baixo) para tentar de novo mais rápido e sem desistir, e força uma nova tentativa assim que o navegador detecta rede de volta ou a aba volta a ficar ativa.
- **Voz/vídeo (WebRTC)**: aqui sim existem várias rotas possíveis (servidores STUN/TURN diferentes), porque isso é uma negociação ponto-a-ponto separada do WebSocket principal. O assistente testa alguns servidores STUN públicos e recomenda o mais rápido — mas quem aplica a configuração é você, colando no menu nativo do Foundry (o módulo não sobrescreve isso sozinho, porque não existe uma API de módulo estável e documentada para isso).
- **TURN**: servidores TURN públicos e gratuitos praticamente não existem, porque TURN retransmite todo o tráfego de mídia (custa banda de verdade para quem hospeda). Para mesas atrás de redes muito restritivas (CGNAT, firewall corporativo), o caminho real é hospedar seu próprio `coturn` ou contratar um serviço.

## Configurações principais

| Setting | Escopo | O que faz |
|---|---|---|
| Intervalo de medição | Mundo | De quanto em quanto tempo cada cliente mede sua latência |
| Ocultar latência | Cliente | Some com o badge na lista de jogadores |
| Modo compacto | Cliente | Mostra `+` / `-` em vez do valor em ms (bom para daltonismo, como no módulo original) |
| Reconexão automática mais agressiva | Cliente | Liga o backoff mais curto e a reconexão forçada |
| Atraso máximo entre tentativas | Cliente | Teto do backoff exponencial |
| Quantas quedas guardar no histórico | Mundo | Tamanho do histórico exibido no painel do GM |

## Estrutura do código

```
scripts/
  constants.js         IDs, nomes de evento, lista de servidores STUN
  settings.js           registro de settings e menus
  latency-monitor.js    mede RTT, jitter e perda; transmite por socket
  diagnostics.js         guarda o estado de cada usuário e o histórico de quedas
  reconnect-manager.js  ajusta backoff do Socket.IO e força reconexão
  player-list-ui.js      injeta o badge na lista de jogadores
  gm-panel.js             painel de diagnóstico (DialogV2)
  webrtc-advisor.js      benchmark de servidores STUN (DialogV2)
  main.js                 ponto de entrada — liga tudo nos hooks init/ready
```

Sem etapa de build: é JavaScript ES Module puro, carregado direto pelo Foundry via `esmodules` no `module.json`.

## Compatibilidade

`minimum: "13"`, `verified: "13.350"`, sem `maximum` definido (compatível com v14 em diante até que uma mudança de API quebre algo — nesse caso, o próprio Foundry avisa o GM antes de deixar ativar).
