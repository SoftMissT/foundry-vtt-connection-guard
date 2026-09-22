# Changelog

## 3.3.4

- **Corrige o botão World Gate que não fazia nada**: o controle registrava `activeTool: world-gate`, e em V13/V14 o `SceneControls#onChangeTool` faz `if (tool === this.tool) return` — como `this.tool` é justamente o tool apontado por `activeTool`, todo clique no cadeado morria nesse `return` antes de disparar `onChange`. Removido o `activeTool` (o botão existe, era clicável, mas nunca chamava o handler).
- `#onToolChange()` passa a ignorar o `active` recebido (valor visual pode estar defasado, ex.: mudança vinda de outro cliente) e recalcula o estado real por `isLocked`.
- Guard de reentrância `#syncing`: a sincronização programática do toggle não reabre o diálogo de confirmação.
- Ícone (`fa-lock`/`fa-lock-open`) e `active` do tool passam a acompanhar o estado real do gate.
- Suíte `verify-gate.mjs` com 80 verificações: GATE-17 reproduz o `#onChangeTool` real do Foundry (clique alcança `onChange`) e GATE-18 garante que `active` defasado não trava o toggle.

## 3.3.3

- **Confirmação antes de fechar/abrir a mesa**: o toggle do Scene Control agora abre um `DialogV2` modal (Sim/Não) — cancelar não altera nada e o toggle visual volta ao estado real. Evita fechamento acidental.
- **Performance**: no `#unlock()` as duas últimas escritas de setting (`GATE_ROLES_BACKUP` + `GATE_LOCKED`) rodam em paralelo via `Promise.all` (menos round-trips sequenciais).
- **Busy guard**: ignor re-clique enquanto o toggle anterior ainda processa (e força re-sincronização do controle).
- i18n pt-BR/en: chaves `Gate.ConfirmLock*` / `Gate.ConfirmUnlock*` / `Gate.ConfirmNo`.
- Suíte `verify-gate.mjs` com 73 verificações (mock de `DialogV2.confirm`: GATE-15 cancel, GATE-16 accept).

## 3.3.2

- **Corrige botão World Gate que não aparecia**: o hook `getSceneControlButtons` agora é registrado no top-level do `main.js` (antes de `init`/`ready`), com holder da instância `WorldGate`. Antes o hook só entrava no `ready`, depois do primeiro render da paleta — o controle ficava invisível até um re-render manual.
- `ui.controls.render(true)` após `WorldGate.start()` garante a paleta atualizada no boot.
- Método público `registerSceneControl(controls)` no `WorldGate`; suíte `verify-gate.mjs` com 64 verificações (inclui GATE-07d: sem `start()` não regista).

## 3.3.1

- **World Gate movido para Scene Controls nativos**: o botão do GM saiu do DOM fixo (cantos inacessíveis/sobrepostos) e agora é um controle nativo do Foundry na paleta lateral (hook `getSceneControlButtons`, API v13/ApplicationV2, compatível 13.350 → 14.999).
- Tool toggle `world-gate` com `onChange(event, active)` (conforme doc oficial foundryvtt.com/api/v13) e sincronização via `ui.controls.activate({ toggles })`.
- Suíte `verify-gate.mjs` atualizada: 63 verificações cobrindo registro do Scene Control, estado do toggle, GM-only e self-eject.

## 3.3.0

- **World Gate (Abrir/Fechar conexão)**: botão nos **Scene Controls** do Foundry (paleta lateral padrão, API v13 — ApplicationV2) para o GM abrir ou fechar a mesa para jogadores — a permissão real de entrada que o módulo não tinha.
- **Bloqueio nativo no servidor:** ao fechar, o GM salva os roles atuais dos players e define `role NONE` (ban nativo do Foundry) em todos os não-GM. O login passa a ser rejeitado no servidor, independente de rota/túnel.
- **Restauração automática:** ao abrir, os roles salvos são restaurados (sem sobrescrever mudanças manuais feitas durante o bloqueio). GM e Assistentes nunca são tocados.
- **Self-eject de players:** clientes conectados recebem o estado via setting/socket e mostram overlay full-screen, com redirecionamento ao login após alguns segundos.
- **Segurança:** o gate não altera rotas, fallback Radmin, firewall ou túneis; não expõe senhas (só roles no backup).
- **Suíte de verificação `verify-gate.mjs`** e execução de `verify` no CI e no script `release` (lint + verify + package).

## 3.2.0

- **Radmin emergency fallback** para Cloudflare, ngrok e playit.gg: quando a rota primária cai, após o timeout configurável (30s padrão) o cliente é redirecionado com segurança para o Radmin.
- **Timeout de failover configurável** (10–120s) e revalidação completa antes de qualquer redirect.
- **Redirect seguro para Radmin** via `location.replace()`: preserva o pathname (routePrefix), não transporta query/hash e nunca anexa cookie, sessionId, token ou senha.
- **Sem failback automático:** depois de entrar no Radmin, o cliente permanece lá mesmo se a PRIMARY voltar. Retorno à PRIMARY é manual ou em nova sessão.
- **Active Route Chip** mostra a rota runtime real: PRIMARY, Radmin (Fallback), Radmin Only ou rota diferente.
- **Radmin Fallback Readiness:** checklist, status "Not Verified", gerador genérico de comando de firewall (copiável, nunca executado) e teste manual da rota via "Open Radmin Test".
- **Sem IPs hardcoded** e sem transporte de credenciais. Radmin Only continua sem runtime de redundância.

## 3.1.1

- Corrige os nomes localizados dos serviços no primeiro dialog.
- O serviço previamente ativo agora aparece selecionado corretamente ao reabrir o assistente.

## 3.1.0

- **Escolha explícita do GM:** o primeiro dialog pergunta qual serviço está sendo usado: Radmin VPN Free, playit.gg, ngrok, Cloudflare Tunnel, LAN, IP direto ou customizado.
- **Configuração sem JSON:** o segundo dialog mostra apenas os campos necessários para o serviço escolhido; o perfil é salvo e ativado automaticamente.
- **Scanner corrigido:** o Route Oracle testa somente a rota ativa escolhida pelo GM, sem sondar serviços que a mesa não utiliza.
- **STUN/TURN removido:** o módulo não configura nem testa voz/vídeo WebRTC. Mesas que usam Discord não precisam dessas opções.

## 3.0.9

- **Assistente Radmin VPN Free:** o GM pode cadastrar nome, IP virtual `26.x.x.x` e porta do Foundry em um dialog box, sem editar JSON.
- **Ativação guiada:** a rota `radmin-vpn` é criada/atualizada, preserva as demais rotas e vira a rota ativa da mesa após o salvamento.
- **Validação e segurança:** o assistente rejeita IP/porta inválidos e não solicita senhas ou credenciais do Radmin.

## 3.0.8

- **HUD GM/jogador alinhado**: ambos exibem a mesma rota ativa e indicam se o cliente ainda está conectado a outro origin; a troca exige abrir o endpoint e recarregar o Foundry.
- **Controle de rota reforçado**: somente o GM pode selecionar ou limpar a rota ativa, inclusive quando a função é chamada diretamente.
- **Diagnóstico de túnel mais seguro**: probes HTTP bloqueados por mixed content são identificados antes de criar timers; a varredura continua não bloqueante e preserva Radmin VPN, playit.gg, ngrok e Cloudflare como rotas orientadas pelo GM.

## 3.0.7

- **Serviço ativo controlado pelo GM**: o Mestre define qual serviço a mesa usa (Radmin VPN, playit.gg, ngrok, Cloudflare Tunnel, LAN, IP direto ou custom) direto do Route Oracle (★ por linha) ou do Painel GM. A escolha propaga para todos os clientes; jogadores recebem notificação e um chip fixo no HUD com link "conectar".
- **HUD unificado GM/jogador**: `routeProfiles` deixou de ser `restricted` jogadores agora veem as mesmas rotas do GM no Route Oracle (antes recebiam lista vazia e só escaneavam a rota atual). Tema Abyss passou a ser `world` (GM decide para a mesa; badges e painéis idênticos para todos).
- **Fim do "travamento" com Radmin VPN free**: o Route Oracle abre imediatamente com estado "escaneando…" por linha e pinta cada resultado na hora; as 3 tentativas de cada rota rodam em paralelo (pior caso por rota = 1× timeout em vez de 3×). Rotas mortas não congelam mais a tela.
- **Classificação corrigida**: `26.x.x.x` agora é reconhecido como Radmin VPN (antes caía em "IP direto"); hostnames ngrok (`*.ngrok-free.app`, `*.ngrok.app`, `*.ngrok.io`) têm tipo próprio.
- **Hints de setup por serviço**: quando uma rota falha, a dica explica o que verificar naquele serviço (Radmin conectado no mesmo grupo; túnel do playit ativo; agente ngrok rodando; cloudflared no host; porta liberada no firewall).

## 3.0.6

- Correções de usabilidade do Route Oracle e redução de ruído do WebRTC (v3.0.5 estendido).

## 3.0.5

- **WebRTC optimizer manual-safe**: não tenta mais escrever em `game.webrtc.settings`; não gera spam para STUN host lookup error; servidor STUN sem resposta é tratado como resultado normal; recomendação/cópia manual do melhor servidor.
- Route profiles aceita JSON avançado OU lista simples de endpoints (um por linha).

## 3.0.4

- Correções de localização e de exportação de journal.

## 3.0.3

- Sincronização de localização (pt-BR/en).

## 3.0.2

- Sincronização de versão do package.

## 3.0.1

- Sincronização de manifesto e documentação da release v3.

## 3.0.0

- **Abyss Link / Route Oracle**: novo painel para comparar rotas configuradas pelo GM, incluindo LAN, Radmin VPN, Cloudflare Tunnel, playit.gg, IP direto e rotas customizadas.
- **Matriz de rotas no painel GM**: o GM pode ver a melhor rota reportada por cada jogador após o scanner.
- **Design manhwa dark**: novo tema Abyss Link com visual escuro/neon para badges, banners e painéis.
- **Journal Exporter em ApplicationV2**: exportação manual em Markdown, JSON, copiar Markdown ou salvar/atualizar uma única Journal Entry.
- **Removido auto-export silencioso**: o módulo não cria Journal Entry automaticamente no shutdown ou por contador; exportação agora exige ação explícita do GM.

## 2.0.4

- **Fix Foundry v14**: `GmPanelMenuLauncher` e `WebRtcAdvisorMenuLauncher` agora são subclasses válidas de `ApplicationV2`, corrigindo o erro "You must provide a menu type that is a FormApplication or ApplicationV2 instance or subclass".

## 2.0.3

- **Journal auto-export**: journal agora é exportado automaticamente como Journal Entry do Foundry, sem depender de ação manual do GM. Export periódico (a cada 50 entradas ou 5 minutos) + export no shutdown como fallback. _(Removido na v3.0.0 em favor de exportação manual explícita.)_

## 2.0.0

- **Auto-otimização WebRTC**: benchmark de STUN/TURN agora aplica automaticamente o melhor servidor na configuração WebRTC do Foundry (com fallback manual se a API não estiver disponível). _(Auto-apply removido na v3.0.5.)_
- **Reconexão preditiva**: detecta degradação de RTT antes da queda e emite alerta ao usuário após N ciclos consecutivos acima do limiar.
- **Adaptive ping interval**: medição fica mais frequente quando a conexão está ruim e menos frequente quando está estável.
- **Journal de testes**: captura todos os eventos de runtime (lifecycle, latência, conexão, degradação, WebRTC, erros) e exporta como Journal Entry do Foundry em markdown.
- **Alertas de degradação**: painel do GM agora mostra histórico de alertas preditivos.
- **Servidores STUN/TURN customizados**: GM pode configurar lista própria via settings.
- **Credenciais TURN seguras**: setting `restricted: true`, nunca logada.
- `webrtc-advisor.js` substituído por `webrtc-optimizer.js`.

## 1.0.0

- Reescrita completa, baseada em `foundry-user-latency` (mawburn), para Foundry v13+.
- Badge de latência para todos os usuários (incluindo GM) na lista de jogadores, com modo compacto opcional.
- Estimativa de jitter e perda de pacotes por ciclos de medição perdidos.
- Marcação de usuário "sem resposta" após ciclos consecutivos sem amostra.
- Gerenciador de reconexão: backoff mais curto, reconexão forçada ao voltar rede/aba, banner visual durante queda.
- Painel de diagnóstico para o GM (latência/jitter/perda/status de todos + histórico de quedas locais).
- Assistente de servidor de voz/vídeo: benchmark de servidores STUN públicos com recomendação e cópia rápida.
- Traduções pt-BR (principal) e en (fallback).
