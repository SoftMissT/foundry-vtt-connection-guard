# Changelog

## 2.0.4

- **Fix Foundry v14**: `GmPanelMenuLauncher` e `WebRtcAdvisorMenuLauncher` agora são subclasses válidas de `ApplicationV2`, corrigindo o erro "You must provide a menu type that is a FormApplication or ApplicationV2 instance or subclass".

## 2.0.3

- **Journal auto-export**: journal agora é exportado automaticamente como Journal Entry do Foundry, sem depender de ação manual do GM. Export periódico (a cada 50 entradas ou 5 minutos) + export no shutdown como fallback.

## 2.0.0

- **Auto-otimização WebRTC**: benchmark de STUN/TURN agora aplica automaticamente o melhor servidor na configuração WebRTC do Foundry (com fallback manual se a API não estiver disponível).
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

## 3.0.0

- **Abyss Link / Route Oracle**: novo painel para comparar rotas configuradas pelo GM, incluindo LAN, Radmin VPN, Cloudflare Tunnel, playit.gg, IP direto e rotas customizadas.
- **Matriz de rotas no painel GM**: o GM pode ver a melhor rota reportada por cada jogador após o scanner.
- **Design manhwa dark**: novo tema Abyss Link com visual escuro/neon para badges, banners e painéis.
- **Journal Exporter em ApplicationV2**: exportação manual em Markdown, JSON, copiar Markdown ou salvar/atualizar uma única Journal Entry.
- **Removido auto-export silencioso**: o módulo não cria Journal Entry automaticamente no shutdown ou por contador; exportação agora exige ação explícita do GM.
