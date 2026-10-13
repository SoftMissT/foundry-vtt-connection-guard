# Política de Segurança

## Versões suportadas

| Versão           | Suporte                              |
| :--------------- | :----------------------------------- |
| 3.5.x (atual)    | Correções de segurança               |
| Anteriores a 3.5 | Não — atualize para a última release |

## Como reportar uma vulnerabilidade

**Não abra issue pública para problemas de segurança.**

1. Use **Security → Report a vulnerability** no GitHub deste repositório (Private Vulnerability Reporting): https://github.com/SoftMissT/foundry-vtt-connection-guard/security/advisories/new
2. Se o canal acima não estiver disponível, abra uma issue curta pedindo contato privado — sem detalhes técnicos.
3. Inclua: versão do módulo, versão do Foundry, passos de reprodução e impacto observado.

Resposta esperada: confirmação em até 7 dias; correção avaliada e, quando aplicável, publicada em release de patch — com crédito, se você quiser.

## Escopo do módulo (o que ele pode e o que não pode)

O Connection Guard roda no cliente e no servidor do Foundry, **sem serviços externos e sem privilégios administrativos**:

- **Não** instala nada, **não** altera firewall/VPN/túneis e **não** pede elevação.
- **Não** armazena credenciais. O único dado persistido sobre usuários é a lista de roles para o World Gate (`gateRolesBackup`), sem senhas.
- O World Gate usa o **ban nativo por role `NONE`** do Foundry: a autorização real acontece no servidor; o módulo apenas a aciona.
- O scanner de rotas faz requisições HTTP `no-cors` **somente para os endereços configurados pelo GM** (rota ativa e fallback).
- Mensagens de socket são validadas por tipo antes de qualquer efeito; o módulo não executa código recebido por socket.
- Nenhum `eval`, `Function` ou injeção de HTML de fonte não confiável: nomes e endereços passam por escape antes de entrar na UI.

## Fora de escopo

- Segurança do servidor Foundry VTT em si (reporte ao projeto Foundry VTT).
- Serviços de túnel/VPN usados pela mesa (playit.gg, ngrok, Cloudflare Tunnel, Radmin).
- Configuração de rede do operador (portas, firewall, DNS).

## Boas práticas para GMs

- Trate `gateRolesBackup` como qualquer dado de mundo: ele contém apenas ids e roles.
- Prefira HTTPS (Cloudflare Tunnel, por exemplo) a HTTP direto quando a mesa não estiver numa rede confiável.
