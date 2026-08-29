# App — Casa (Expo)

Expo Router + TypeScript. Estrutura em `src/`:

| Pasta | Papel |
|---|---|
| `src/app/` | rotas por arquivo (Expo Router) |
| `src/design-system/` | tokens — **único lugar do app onde `#hex` é permitido** |
| `src/lib/api/` | client HTTP tipado — **único lugar que faz `fetch`** |
| `src/features/` | telas e lógica por domínio (tarefas, objetivos, pulso…) |

As duas regras acima não são estilo: são guardas de camada, cobradas por
`npm run guards` na raiz. Componente com `fetch` direto não dá pra cachear,
mockar nem trocar de transporte — e se quebra por acidente, num autoimport.

## Rodar

```bash
npm run db:up            # na raiz — Postgres
npm run dev -w @casa/api # na raiz — API em :3333
npm start -w @casa/mobile
```

A tela inicial do 0a é andaime: mostra o estado do banco e o role da conexão.
Se aparecer role diferente de `casa_app`, o ADR-0002 foi violado. A primeira
tela de produto é o criador da Fase 0 (Épico 1).

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

## OTA (ADR-0007)

`expo-updates` está instalado e o `eas.json` já tem os canais
(`development` / `preview` / `production`). **Nenhum update é publicado até o
Épico 6** — por isso `updates.enabled: false` no `app.json`.

O módulo é nativo: adicionar depois custaria rebuild e nova submissão às lojas,
exatamente quando já houvesse gente instalada. Falta rodar `eas init` (precisa
de conta Expo) para o `updates.url` receber o id do projeto.

> [!warning] OTA entrega só JavaScript
> Trocar módulo nativo, versão de SDK ou permissão continua exigindo build e
> submissão. Confundir os dois é como se descobre tarde que o rollback não existia.

## Tokens

Os **nomes** vêm da identidade definida (handoff §5): `moss`, `amber`, `coral`,
`lime`. Os **valores** em `src/design-system/tokens.ts` são provisórios — o
`tokens.json` ainda não foi exportado do Figma. Não desenhar tela de produto em
cima deles.
