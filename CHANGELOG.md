# Changelog

## 1.0.0

- Reescrita completa, baseada em `foundry-user-latency` (mawburn), para Foundry v13+.
- Badge de latência para todos os usuários (incluindo GM) na lista de jogadores, com modo compacto opcional.
- Estimativa de jitter e perda de pacotes por ciclos de medição perdidos.
- Marcação de usuário "sem resposta" após ciclos consecutivos sem amostra.
- Gerenciador de reconexão: backoff mais curto, reconexão forçada ao voltar rede/aba, banner visual durante queda.
- Painel de diagnóstico para o GM (latência/jitter/perda/status de todos + histórico de quedas locais).
- Assistente de servidor de voz/vídeo: benchmark de servidores STUN públicos com recomendação e cópia rápida.
- Traduções pt-BR (principal) e en (fallback).
