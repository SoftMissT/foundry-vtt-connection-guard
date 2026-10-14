---
title: "Política de segurança"
status: active
last_reviewed: 2026-10-14
---

# Política de segurança

## Versões suportadas

| Versão | Suporte |
| :-- | :-- |
| 3.6.x (atual) | Correções de segurança |
| Anteriores a 3.6 | Sem suporte; atualize para a última release |

O manifesto declara Foundry VTT 13 como mínimo e 14.999 como versão verificada. Versões posteriores podem funcionar, mas não são uma garantia de segurança ou compatibilidade.

## Como reportar uma vulnerabilidade

**Não abra uma issue pública com detalhes da vulnerabilidade.**

1. Use **Security → Report a vulnerability** no [repositório do projeto](https://github.com/SoftMissT/foundry-vtt-connection-guard/security/advisories/new).
2. Se esse canal não estiver disponível, abra uma issue curta pedindo contato privado, sem prova de conceito, endereço de mesa, IP, token ou credencial.
3. Informe a versão do módulo e do Foundry, impacto, pré-condições e passos mínimos para reprodução. Remova dados pessoais e de rede que não sejam necessários.

O projeto pretende confirmar o recebimento em até 7 dias. A prioridade e o prazo de correção dependem da severidade e da possibilidade de reprodução. Correções aceitas são publicadas em release de patch, com crédito ao pesquisador quando solicitado.

## Modelo de ameaça e fronteiras de confiança

- Configurações de mundo, escolha da rota ativa e alterações de role são operações de GM e continuam sujeitas às permissões do Foundry.
- Mensagens no canal de socket do módulo são tratadas como **dados não confiáveis**. Elas só transportam telemetria e resultados de scan; não podem abrir ou fechar o World Gate, alterar roles, settings ou executar código.
- Amostras e relatórios recebidos são limitados, normalizados e aceitos apenas para ids de usuários existentes. O canal não fornece ao módulo uma prova criptográfica de que o remetente é o usuário declarado; portanto, métricas remotas são informativas e não devem ser usadas como autorização.
- O estado do World Gate deriva do setting de mundo `gateLocked`. O bloqueio efetivo usa role `NONE` no servidor; o overlay do cliente não é a barreira de autorização.

## Dados e persistência

- Latência, jitter, perda, quedas e relatórios de rota ficam em memória enquanto a aba está aberta.
- Perfis e URLs de rota, rota ativa, configuração de redundância e backup de roles do gate são settings do mundo. URLs podem conter IPs ou hostnames da mesa e devem ser protegidas como dados de rede.
- O módulo rejeita URLs com usuário/senha e não armazena cookies, senhas, tokens ou ids de sessão.
- O Journal só é persistido quando o GM escolhe exportá-lo. Revise e remova nomes, IPs e hostnames antes de compartilhar o arquivo.

## Rede e privilégios

- O scanner aceita somente origins HTTP/HTTPS configuradas e usa `fetch` com `mode: "no-cors"`, `credentials: "omit"`, sem cache e com timeout.
- O módulo não instala software, não executa PowerShell, não altera firewall, VPN, DNS ou túnel e não solicita privilégios administrativos.
- O comando de firewall exibido para Radmin é somente texto copiável; o GM decide se e onde executá-lo.
- O pacote não possui dependências npm de runtime. Ferramentas npm são usadas apenas para desenvolvimento, verificação e empacotamento.

## Fora de escopo

- Vulnerabilidades do Foundry VTT, do navegador, do sistema operacional ou dos serviços de túnel/VPN.
- Disponibilidade e confidencialidade de HTTP sem TLS, DNS, roteador, firewall ou infraestrutura operada pelo GM.
- Métricas falsificadas por um participante já autorizado na mesa. Elas podem afetar apenas diagnóstico e Journal, não permissões.

## Boas práticas para GMs

- Mantenha Foundry e o módulo atualizados e prefira HTTPS fora de uma rede confiável.
- Não coloque credenciais em URLs. Trate perfis de rota, exportações e `gateRolesBackup` como dados do mundo.
- Teste fechar e reabrir o World Gate antes da sessão e mantenha um backup recente do mundo.
