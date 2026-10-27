# App — Casa (Expo)

Expo Router + TypeScript. Estrutura em `src/`:

| Pasta | Papel |
|---|---|
| `src/app/` | rotas por arquivo (Expo Router) |
| `src/design-system/` | tokens e primitivas visuais — **único lugar do app onde `#hex` é permitido** |
| `src/componentes/` | composições do app; é onde o React Hook Form encosta no design system |
| `src/lib/api/` | client HTTP tipado — **único lugar que faz `fetch`** |
| `src/lib/sessao/` | access em memória + refresh no secure store (ADR-0008) |
| `src/features/` | telas e lógica por domínio (tarefas, objetivos, pulso…) — a partir do Épico 2 |

As duas regras em negrito não são estilo: são guardas de camada, cobradas por
`npm run guards` na raiz. Componente com `fetch` direto não dá pra cachear,
mockar nem trocar de transporte — e se quebra por acidente, num autoimport.

Há mais duas fronteiras, essas só por convenção: o design system não conhece
React Hook Form, e `lib/api/nucleo.ts` não conhece Expo. Existem pelo mesmo
motivo — trocar a biblioteca de formulário ou rodar o interceptor em teste Node
não deveria custar reescrita.

## Rodar

```bash
npm run db:up            # na raiz — Postgres
npm run dev -w @casa/api # na raiz — API em :3333
npm start -w @casa/mobile
```

## O fluxo da Fase 0 (Épico 1)

`src/app/index.tsx` é o boot: fica **atrás do splash** e decide o destino antes
de ele sair.

| Estado | Destino |
|---|---|
| sem sessão | `/entrar` |
| sessão viva, sem casa | `/nova-casa` |
| sessão viva, com casa | `/casa` |
| servidor inalcançável | tela de "sem conexão" — **nunca** a de entrar |

`/nova-casa` é a bifurcação: criar casa é o padrão, e "Tenho um código de
convite" leva a `/entrar-na-casa`. Toda conta sem casa cai ali, inclusive quem
foi convidado — o servidor não tem como saber que existe um código no WhatsApp
de alguém.

A última linha é a que costuma sair errada: rede fora não é credencial negada.
O refresh continua no cofre e a pessoa volta direto para a casa quando o sinal
voltar (ADR-0008).

Sair da conta fica no fim da aba Casa. Revoga a **família** do refresh no
servidor (`POST /api/auth/logout`, sob RLS — migration 0004) e apaga o cofre
local. As duas metades são independentes de propósito: sem rede, a limpeza
local acontece do mesmo jeito e a revogação fica para trás — quem pediu para
sair sai, e ficar preso numa conta por falta de sinal seria pior. O access
token que já estava em memória continua tecnicamente válido até vencer
(~15 min): a blocklist de `jti` do ADR-0003 ainda não é lida por ninguém, e
escrever numa lista que ninguém consulta seria decoração.

## Convite por código curto

A aba Casa (e o cartão de primeiros passos) gera um código de 6 caracteres; quem recebe digita em
`/entrar-na-casa` e cai na MESMA casa. Uso único, validade de 7 dias, sem deep
link e sem URL pública — é a fatia do convite do Épico 2 que funciona na LAN.

O alfabeto é base32 de Crockford (sem `I`, `L`, `O`, `U`), e o mesmo módulo do
`@casa/contracts` que valida também **normaliza**: minúscula, hífen colado do
WhatsApp e as confusões visuais (`O`→`0`, `I`/`L`→`1`) viram o código certo
antes de sair do celular — e a API roda o mesmo schema de novo (ADR-0009).

Entrar numa casa continua sem ser um `UPDATE`: é a função `entra_na_casa()`
(migration 0005), a segunda e última porta ao lado de `cria_casa()`. `casa_app`
não tem `UPDATE (casa_id)` em `moradores`, então descobrir o uuid de uma casa
não basta para entrar nela.

Fora do escopo, de propósito: QR code e deep link (precisam de URL pública —
Épico 0b), cancelar convite e login com Google (sem client id).

## Tarefas (Épico 2)

Depois da Fase 0 o app vira **abas**: Tarefas e Casa. Início e Objetivos entram
com os Épicos 3 e 4 — aba vazia esperando conteúdo seria um canto morto.

* **Tarefas** — a lista da casa em três recortes (Todas, Minhas, Livres), os
  pontos ("sua parte" e o total da casa, e em nenhum outro lugar), o cartão de
  **primeiros passos** (Fase 1: convidar → concluir uma tarefa) e o `+` para
  criar. Tocar num cartão abre a tela de editar/apagar.
* **Casa** — quem mora aqui, convidar e sair.

Concluir pede confirmação: conclusão é evento append-only e não se desfaz.
Toda mudança de tarefa invalida `tarefas`, `casa` e `pontos` juntas
(`lib/api/chaves.ts`) — apagar também mexe nos pontos, porque as conclusões da
tarefa saem por cascade.

## Device físico no WSL2

O WSL2 fica atrás de NAT: por padrão o celular **não** alcança nem o Metro nem a
API rodando no Linux. Dois caminhos, nesta ordem:

**1. Rede espelhada (preferido).** No Windows, em `%UserProfile%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

`wsl --shutdown` e abrir de novo. O WSL passa a usar a mesma interface do
Windows — o celular alcança `http://<ip-da-máquina>:8081` e `:3333` direto,
como se fosse nativo. Pode ser preciso liberar as portas no firewall do Windows.

**2. Túnel (quando a rede não colabora — Wi-Fi de visitante, VPN).**

```bash
npm run tunel -w @casa/mobile   # expo start --tunnel, via @expo/ngrok
```

O túnel resolve **só o Metro**. A API continua inalcançável: exponha ela também
(`cloudflared tunnel --url http://localhost:3333`) e aponte o app para a URL
resultante:

```bash
EXPO_PUBLIC_API_URL=https://<sua-url> npm start -w @casa/mobile
```

Sem `EXPO_PUBLIC_API_URL`, o client usa o host que serviu o bundle na porta 3333
— o que funciona no caminho 1 e não funciona no 2.

## APK de teste (EAS)

O projeto no EAS é `@brunoherdina/casa`. O perfil `preview` gera **APK**
(`android.buildType`), e não o AAB padrão — AAB só instala pela Play Store, e o
ponto aqui é mandar o arquivo pelo WhatsApp.

```bash
npx eas-cli build --platform android --profile preview
```

Duas coisas ficam **congeladas no APK** no momento do build, e as duas moram no
`eas.json`:

* `EXPO_PUBLIC_API_URL` — o app compilado não tem Metro para adivinhar o host,
  então o endereço da API entra fixo: `https://casa.prumoz.com.br`, a API de
  produção (ADR-0014), em `preview` e em `production`. O APK funciona em
  qualquer rede, e quem testa cria conta no banco de produção.
* o canal de updates (`preview`) — irrelevante até o Épico 6, que é quando OTA
  liga.

> [!warning] HTTP em claro só no perfil `development`
> Android 9+ bloqueia cleartext, e build de release não herda a exceção do modo
> debug. `app.config.ts` liga `usesCleartextTraffic` só para `development` (o
> dev client, que fala com a API na LAN). `preview` e `production` falam HTTPS
> e ficam sem a permissão: cleartext num APK que anda por aí transforma
> qualquer Wi-Fi hostil em leitura de token. APK de preview contra a API local
> exige trocar o perfil — não religar a permissão no `preview`.

`app.config.ts` existe só para isso: o Expo lê `app.json` primeiro e passa o
resultado para a função, que acrescenta o que depende do perfil de build.

> [!note] `eas` travando em ETIMEDOUT nesta máquina
> O IPv6 sai pela WSL2 e não volta; o `curl` desiste rápido e o Node não. Os
> comandos do EAS precisam de:
> ```bash
> export NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"
> ```

## OTA (ADR-0007)

`expo-updates` está instalado e o `eas.json` já tem os canais
(`development` / `preview` / `production`). **Nenhum update é publicado até o
Épico 6** — por isso `updates.enabled: false` no `app.json`.

O módulo é nativo: adicionar depois custaria rebuild e nova submissão às lojas,
exatamente quando já houvesse gente instalada. O `eas init` já rodou — o
`projectId` está em `app.json` — mas `updates.url` continua ausente porque
`updates.enabled` é `false`: o campo entra junto com o primeiro `eas update`
publicado, no Épico 6.

> [!warning] OTA entrega só JavaScript
> Trocar módulo nativo, versão de SDK ou permissão continua exigindo build e
> submissão. Confundir os dois é como se descobre tarde que o rollback não existia.

## Tokens

Os **nomes** vêm da identidade definida (handoff §5): `moss`, `amber`, `coral`,
`lime`. Os **valores** em `src/design-system/tokens.ts` são provisórios — o
`tokens.json` ainda não foi exportado do Figma. Não desenhar tela de produto em
cima deles.
