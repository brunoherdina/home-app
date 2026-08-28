---
name: casa-dominio-cooperacao
description: "Valida os invariantes cooperativos e de anonimização do Casa — sem ranking, frustração agregada, aspiração privada, energia/nível/ofensiva/meta coletiva. Skill de domínio MAIS crítica: codifica as regras invioláveis §2. Usar quando a tarefa toca cooperação, dados sensíveis, ou gamificação."
---

# Domínio — Cooperação & Anonimização (Casa)

Persona: validador de domínio crítico. Codifica as regras invioláveis §2 — se algo aqui quebra, o produto perde a alma e a confiança.

Fronteira com segurança: esta skill **define** a regra; [casa-seguranca-privacidade](../casa-seguranca-privacidade/SKILL.md) **impõe** na camada RLS. Toda regra abaixo tem que ter uma policy que a prove.

## Ler primeiro

1. [Manifesto §2 (regras invioláveis) + §4 (domínio)](../../../casa-manifesto-projeto.md)
2. [casa-seguranca-privacidade](../casa-seguranca-privacidade/SKILL.md)

## Vocabulário

`energia da casa`, `nível`, `ofensiva/streak`, `meta coletiva`, `recompensa compartilhada`, `contribuição não-competitiva`, `sua parte`, `frustração agregada`, `pulso anônimo`, `aspiração privada`.

## Invariantes (não-negociáveis)

1. **Sem ranking/pódio por pessoa.** Progresso individual só como "sua parte"; comparação entre moradores nunca existe — nem em schema, endpoint ou tela.
2. **Frustração/incômodo → peso agregado**, jamais atribuído a uma pessoa.
3. **Pulso semanal → termômetro anônimo** da casa, não ranking de humor por pessoa.
4. **Aspiração "pra mim" → privada.** Só aspiração "pra casa"/"pro grupo" vira objetivo compartilhado.
5. **Gamificação é cooperativa**: energia, nível, ofensiva e meta são **da casa**, coletivos.

## Como validar (exemplos canônicos)

- Concluir tarefa → sobe energia/nível **da casa**; nunca cria posição comparativa entre moradores.
- Registrar incômodo → afeta distribuição como peso; nenhuma consulta liga incômodo↔autor para terceiros.
- Pulso semanal de 4 moradores → termômetro agregado; impossível derivar o humor de um indivíduo.
- Pulso numa casa de 2 → abaixo do piso de respostas: a pergunta não é feita (ADR-0011).
- Aspiração "quero ler mais" (pra mim) → invisível ao grupo. "Quero a sala organizada" (pra casa) → vira objetivo.
- Qualquer feature de gamificação → passa no teste: "isso cria competição individual?" Se sim, rejeitar.

## Contexto adicional

Escopo do pulso fechado no **ADR-0011**: **só humor**, nunca "alguém está sobrecarregado?".

> [!danger] Anonimato numa casa de 2 não existe
> Casal é o público principal. Com dois moradores, qualquer resposta "anônima" é reidentificável no
> ato — se o termômetro mudou e não foi você, foi a outra pessoa. Daí a **regra do piso**: agregado
> só é exibido acima de um mínimo de respostas; casa que não atinge o piso **não recebe a pergunta**.
> Vale pro pulso e pros incômodos.

Sobrecarga não some do produto — ela é **inferida** do peso de tarefas concluídas contra a
distribuição esperada, sem criar dado sensível novo (Épico 4).

Pontos-bônus do **ADR-0010** entram aqui como teste: alimentam "sua parte" e a meta coletiva, nunca
comparação entre moradores.
