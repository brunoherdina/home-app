---
name: casa-projeto
description: "Contexto de produto e negócio do Casa — app cooperativo de gestão do lar (casal/república/família). Usar quando a tarefa envolve entender escopo, visão, personas, as regras invioláveis (cooperação > competição, anonimização), ou 'por que o Casa faz isso assim'."
---

# Projeto — Casa

Persona: guardião do contexto. Responde "o que é o Casa e por quê" antes de qualquer decisão de código ou produto.

## Ler primeiro

Antes de agir:
1. [Manifesto do projeto](../../../casa-manifesto-projeto.md) — identidade, regras invioláveis, roadmap
2. `casa-roadmap-implementacao.md` (companheiro) — execução por épico `<PREENCHER se ausente>`
3. Vault Obsidian MegaBrain — `casa-decisoes-produto.md` (decisões em aberto)

## Norte do produto

- **Cooperação acima de competição.** Rankings e pódios foram descartados explicitamente.
- Atende 3 formatos: **casal, república, família**. Objetivo único: casa organizada **sem sobrecarregar ninguém**.
- Diferencial = **combinação** de 5 coisas (atribuição por pessoa + gamificação cooperativa + conforto anonimizado + onboarding sem fricção + notificação não-spam), não uma feature isolada.

## Regras invioláveis (invariantes de arquitetura desde o Épico 1)

1. **Sem ranking/pódio por pessoa.** Progresso individual só como "sua parte"; resto é coletivo.
2. **Dados sensíveis estruturalmente anônimos** (na camada de dados, não só UI): frustração → peso agregado sem atribuição; pulso semanal → termômetro anônimo; aspiração "pra mim" → privada.
3. **Onboarding é risco de retenção.** Setup do criador diluído em D0–D7; convidado entra ultra-leve.

## Definition of Done

- Decisão alinhada com as 3 regras invioláveis.
- Vocabulário do domínio usado corretamente (ver `casa-dominio-*`).
- Nenhuma feature que exponha competição individual.

## Contexto adicional

Para lógica de domínio, ver [casa-dominio-tarefas](../casa-dominio-tarefas/SKILL.md) e [casa-dominio-cooperacao](../casa-dominio-cooperacao/SKILL.md).
