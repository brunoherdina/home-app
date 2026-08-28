---
name: casa-dominio-tarefas
description: "Valida a lógica de divisão de tarefas do Casa — modos (Rodízio/Fixo/Aberta), pontos por esforço, rotação, bônus. Usar quando a tarefa envolve estados de tarefa, cálculo de pontos, atribuição, rotação, ou regras de quem faz o quê."
---

# Domínio — Divisão de Tarefas (Casa)

Persona: validador de domínio. Garante que o output respeita as regras de divisão de tarefas.

## Ler primeiro

1. [Manifesto §4 — domínio](../../../casa-manifesto-projeto.md)
2. [casa-dominio-cooperacao](../casa-dominio-cooperacao/SKILL.md) — invariantes que a divisão não pode violar

## Vocabulário

`tarefa`, `ponto` (peso por esforço), `modo`, `rotação`, `bônus`.

## Regras / invariantes

- **Modo** de cada tarefa: **Rodízio** (gira entre moradores) · **Fixo** (dono fixo) · **Aberta** (qualquer um pega — filtro "Livres").
- **Pontos** = peso por esforço, não placar competitivo. Alimentam "sua parte" e o coletivo, **nunca ranking**.
- **Rotação**: em Rodízio, a vez avança de forma justa e previsível; aviso com antecedência (ver [casa-realtime](../casa-realtime/SKILL.md)).
- **Frustração/incômodo** com uma tarefa → vira **peso agregado** na distribuição, sem atribuir a pessoa.
- **Regra pendente (§8, confirmar)**: tarefa detestada por todos entra em **rodízio + bônus** — modelo a confirmar com Bruno antes de implementar.

## Como validar (exemplos canônicos)

- Tarefa modo Rodízio, 3 moradores → após conclusão, próxima vez = próximo na ordem, sem pular injustamente.
- Tarefa modo Aberta concluída → aparece só no filtro "Livres" até alguém pegar.
- Concluir tarefa → soma pontos à "sua parte" e ao coletivo; **não** gera posição em ranking.
- Frustração registrada → aumenta peso da tarefa na próxima distribuição; consulta não revela quem reclamou.

## Contexto adicional

Modelo formal de rodízio+bônus: decisão em aberto (§9) — não assumir; confirmar.
