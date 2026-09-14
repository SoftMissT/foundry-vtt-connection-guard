# Changelog

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
