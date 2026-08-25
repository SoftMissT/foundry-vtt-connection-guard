# Changelog

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
