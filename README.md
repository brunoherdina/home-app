# Casa

App de cooperação doméstica. Cooperação acima de competição: **nenhum ranking,
nunca** — e a anonimização dos dados sensíveis é imposta pelo banco, não pela UI.

Documentos de referência: [manifesto](casa-manifesto-projeto.md) ·
[decisões (ADRs)](casa-decisoes-produto.md) · [roadmap](casa-roadmap-implementacao.md) ·
[handoff de stack](casa-handoff-stack-expo.md).

## Monorepo

| Pacote | O que é |
|---|---|
| [apps/mobile](apps/mobile/) | app Expo (React Native + TS) — [README](apps/mobile/README.md) |
| [apps/api](apps/api/) | API Fastify + Drizzle, e o `worker/` de jobs |
| [packages/contracts](packages/contracts/) | schemas zod compartilhados app ↔ API (ADR-0009) |
| [infra](infra/) | compose, roles do Postgres e os scripts de prova — [README](infra/README.md) |

## Começar

```bash
npm install
cp infra/.env.example infra/.env   # preencher senhas e URLs
npm run db:up                      # Postgres em container
npm run db:migrate -w @casa/api    # migrations, como casa_owner
npm run dev -w @casa/api           # API em :3333
npm start -w @casa/mobile          # Expo
```

Device físico no WSL2 tem duas armadilhas de rede — ver
[apps/mobile/README](apps/mobile/README.md#device-físico-no-wsl2).

## Verificar

```bash
npm run verify
```

Roda, nesta ordem: guardas de camada, contrato de roles, negação por identidade
e typecheck. Vale a pena entender por que cada uma existe:

| Comando | O que prova |
|---|---|
| `npm run guards` | nenhum componente faz `fetch` direto · nenhuma rota toca o pool cru · nenhuma cor literal fora do design system |
| `npm run check:roles` | o pool não é superusuário, não tem `BYPASSRLS`, não é dono de tabela; nenhuma tabela sem RLS ou sem `FORCE` |
| `npm run check:rls` | a policy **nega** de fato — sem identidade, com identidade de outro morador, e por id (IDOR) |
| `npm run check:migration` | up → down → up limpo (o drizzle-kit não gera `down`) |

Nenhuma delas é teste funcional, e é esse o ponto: a API entre o app e o
Postgres torna possível conectar como owner e checar permissão em TypeScript.
Aí a RLS vira decoração, os invariantes voltam para código de aplicação e
**nenhum teste funcional quebra**. Ver [ADR-0002](casa-decisoes-produto.md).

## Estado

**Épico 0a — fundação local.** O que existe hoje é substrato: banco, contrato de
acesso, esqueleto do app e da API. A primeira tela de produto (criador da Fase 0)
é o Épico 1.
