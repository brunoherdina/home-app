---
name: casa-realtime
description: "Realtime e notificações do Casa — LISTEN/NOTIFY + WebSocket no Fastify (anel Energia, meta coletiva ao vivo) + worker de cron para notif com horário de silêncio, aviso de vez, e motor de nudges D0–D7. Usar quando a tarefa envolve realtime, push, agendamento, ou o motor de nudges de onboarding."
---

# Realtime & Notificações — Casa

Persona: engenheiro de eventos e agendamento. Estado ao vivo + notificação parcimoniosa e cooperativa.

## Ler primeiro

1. [casa-backend-dev](../casa-backend-dev/SKILL.md) — rotas, `withUser`, idempotência
2. [Manifesto §5 — notificação inteligente + nudges D0–D7](../../../casa-manifesto-projeto.md)
3. [ADR-0004](../../../casa-decisoes-produto.md) — por que `LISTEN/NOTIFY` e não Realtime gerenciado

## Realtime (`LISTEN/NOTIFY` + WebSocket)

- Trigger no Postgres emite `NOTIFY casa_<casa_id>` quando o estado coletivo muda. Uma conexão dedicada da API fica em `LISTEN` e faz fan-out por **WebSocket** para os clientes daquela casa.
- Alimenta: **anel Energia da Casa** (Início) e **meta coletiva** (aba Casa) ao vivo.
- **Payload sempre agregado** — nunca stream de linhas da tabela. Não é otimização: um stream cru vazaria a atribuição que a RLS bloqueia na query.
- `NOTIFY` **não persiste** e tem teto de **8 KB**. O WS é **invalidação de cache**, não fonte da verdade: ao reconectar, o cliente refaz o fetch.
- A conexão de `LISTEN` fica ocupada permanentemente — fora do pool de requests.

## Notificações (worker + cron)

- **Horário de silêncio**: respeitar janela; nunca notificar dentro dela.
- **Tom cooperativo**: "é a sua vez" com antecedência, não cobrança.
- **Parcimoniosa**: sem spam; agrupar quando possível.
- Idempotência: o cron do worker pode reexecutar — não duplicar notif.
- Quiet hours é **regra de agendamento no servidor**, não filtro no cliente.

## Motor de nudges D0–D7 (onboarding Fase 2)

Ordem fixa (manifesto §5): Início → tarefa que curte/detesta → como dividir + frequências → aspirações viram objetivos → meta semanal + recompensa → incômodos anônimos + ativar pulso (por último).
- Cada nudge dispara por evento/tempo, uma vez, respeitando silêncio.
- Convidado entra ultra-leve — não empilhar nudges nele.

## Definition of Done

- Nenhuma notif em horário de silêncio.
- Jobs idempotentes.
- Realtime não vaza dado individual comparável — payload agregado, verificado.
- Cliente reidrata corretamente após reconexão do WS.
- Sequência de nudges respeita a ordem e não repete.

## Contexto adicional

Escopo do pulso semanal ainda em aberto (§9) — confirmar antes de agendar o nudge final.
