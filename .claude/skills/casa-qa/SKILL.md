---
name: casa-qa
description: "Cultura de testes do Casa — cobertura, fixtures, guardas de camada e o princípio 'testes verificam intenção, não só comportamento'. Cobre E2E até a decisão Maestro×Detox. Usar quando a tarefa envolve escrever/rodar testes, definir fixtures, guardas, ou validar que um fluxo funciona."
---

# QA — Casa

Persona: advogado de qualidade. Testes provam a **intenção** (a regra de negócio), não só que o código roda.

## Ler primeiro

1. [casa-arquitetura](../casa-arquitetura/SKILL.md) — DoD
2. Regras invioláveis (manifesto §2) — o que os testes DEVEM garantir

## Princípios

- **Intenção > comportamento.** Testar "frustração nunca fica atribuída a pessoa", não só "função retorna array".
- Pirâmide: muito unit, algum integração, pouco E2E.
- Fixtures deterministas. Sem depender de relógio real / ordem.
- Casos críticos a cobrir sempre: anonimização (RLS bloqueia leitura cruzada), cálculo de pontos, transições de estado de tarefa, ausência de ranking.

## Guardas de camada (leitura de fonte)

Baratas de escrever, impedem erosão silenciosa — o tipo de defeito que **nenhum teste funcional pega**:

1. **App**: nenhum componente faz `fetch` direto; tudo por `lib/api/`.
2. **API**: nenhum handler toca o pool cru; tudo pelo plugin `withUser` (ADR-0002). Sem esta, um handler fura a RLS e a suíte fica verde.
3. **Cor literal**: `#hex`/`rgba()` fora do design system reprova.

As três são executáveis: `npm run guards` (fonte em `scripts/guards/`). Falham
com `exit 1`, então servem de passo de CI no Épico 0b.

## Testes que o servidor próprio exige

- **Negação por identidade**: para cada tabela sensível, abrir transação como `casa_app` com o `app.current_user_id` de **outro** membro e afirmar zero linhas atribuíveis. Roda contra o Postgres do compose — mock de RLS não prova nada. Piso pronto em `npm run check:rls`; `npm run check:roles` cobre o catálogo.
- **Migration up → down → up**: o drizzle-kit não gera `down` (ADR-0005); este teste é o que torna a reversibilidade cobrável. Automatizado em `npm run check:migration`.
- **Idempotência de job**: rodar o job do worker duas vezes e afirmar efeito único.

## Cobertura mínima

- Toda regra inviolável §2 tem ao menos 1 teste que falha se a regra for quebrada.
- Máquinas de estado (`casa-dominio-tarefas`) com testes de transição inválida.

## E2E (provisório)

Maestro × Detox segue em aberto (handoff §11). Até decidir, E2E fica aqui como roteiro manual documentado — com atenção ao fluxo multi-usuário (convite → aceite → tarefa concluída por outro membro), que é onde E2E paga mais no Casa. Quando a ferramenta entrar, considerar skill `casa-qa-lead` dedicada — registrar no harness-report.

## Definition of Done

- Testes de intenção para o que a task mudou.
- `npm run verify` verde (guardas + roles + RLS + typecheck).
- Verde local; sem teste flaky.

## Contexto adicional

Validação de lógica de domínio: delegar asserções a [casa-dominio-cooperacao](../casa-dominio-cooperacao/SKILL.md).
