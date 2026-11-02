# Guia — primeiro build iOS (TestFlight)

Caminho decidido no [ADR-0017](../../casa-decisoes-produto.md#adr-0017--distribuição-testflight-contas-da-prumoz-e-ota-de-teste):

- conta Apple da **Prumoz**, como organização;
- app entregue pelo **TestFlight interno** no iPhone do dogfooding;
- correções só de JavaScript chegam por **OTA no canal `preview`**.

Não precisa de Mac. O EAS compila e assina na nuvem, e tudo roda daqui do WSL.

## Visão geral

| # | Fase | Quem | Espera típica |
|---|---|---|---|
| 1 | Pré-requisitos da empresa | Bruno | — |
| 2 | Número D-U-N-S | Bruno | até 5 dias úteis + 2 dias úteis |
| 3 | Apple Developer Program (organização) | Bruno | verificação da Apple, alguns dias |
| 4 | Preparar o código | Claude, em PR | corre em paralelo às fases 1–3 |
| 5 | Primeiro build iOS | Bruno, no terminal | fila do EAS |
| 6 | App no App Store Connect + envio | Bruno | processamento da Apple, de minutos a ~1 h |
| 7 | Instalação no iPhone dela | ela | — |
| 8 | Atualizações do dia a dia | Bruno | — |

As fases 1 a 3 são o caminho crítico. Comece pelo D-U-N-S hoje: é a única espera que você não controla.

---

## Fase 1 — Pré-requisitos da empresa

A Apple confere tudo isto na inscrição de organização:

- [ ] **Pessoa jurídica.** LTDA ou SLU, com CNPJ ativo.
  - A Apple não aceita nome fantasia.
  - Na loja aparece a **razão social exata**. Confira no cartão CNPJ como ela está escrita.
- [ ] **Autoridade legal.** Quem se inscreve vira o Account Holder e precisa poder assinar pela empresa
  (sócio ou administrador).
- [ ] **Site público e funcional** no domínio da empresa. `prumoz.com.br` já atende: respondeu 200 em
  2026-10-27.
- [ ] **E-mail de trabalho no domínio da empresa**, por exemplo `bruno@prumoz.com.br`. A Apple exige
  isso. Se ainda não existe, crie a caixa no painel do domínio antes de começar.
- [ ] **Apple Account com autenticação de dois fatores** ligada.
- [ ] **Endereço e telefone da empresa iguais aos do CNPJ.** A D&B e a Apple cruzam esses dados.
- [ ] **Cartão para pagar US$ 99/ano.** O valor aparece em reais na inscrição.

> [!warning] SLU é o caso ambíguo
> A Apple manda "sole proprietor/single person business" entrar como pessoa física. Uma LTDA com mais
> de um sócio passa sem dúvida. Se a Apple recusar a SLU como organização, a saída é a inscrição
> individual: o vendedor aparece com o seu nome. Nesse caso, avise para registrarmos no ADR-0017.

## Fase 2 — D-U-N-S

O D-U-N-S é grátis e é **um só para as duas lojas**: o Google Play pede o mesmo número.

1. Abra o [D-U-N-S lookup da Apple](https://developer.apple.com/enroll/duns-lookup/) e entre com a sua
   Apple Account.
2. Informe a razão social, o endereço da sede, o endereço de correspondência e o seu contato de
   trabalho.
3. Se a empresa já tiver número, anote. Se não tiver, envie o pedido pelo próprio formulário.
   - A D&B leva **até 5 dias úteis** para emitir o número.
   - Depois disso, a Apple leva **até 2 dias úteis** para recebê-lo.
   - A D&B pode ligar ou mandar e-mail para confirmar os dados.
4. Se passar de duas semanas, escreva para o [suporte da D&B](https://support.dnb.com/?CUST=APPLEDEV).

## Fase 3 — Apple Developer Program como organização

1. Acesse [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/) e clique
   em *Start your enrollment*.
2. Escolha o tipo de entidade **Company / Organization**.
3. Preencha razão social, D-U-N-S, site, e-mail de trabalho e telefone.
4. Aguarde a verificação. A Apple pode entrar em contato para confirmar a sua autoridade sobre a empresa.
5. Pague os US$ 99.
6. A inscrição está pronta quando:
   - chega o e-mail de boas-vindas;
   - o [App Store Connect](https://appstoreconnect.apple.com) abre com a Prumoz como equipe.
7. Anote o **Team ID**, que fica em *Account → Membership details*. Ele vai ser preciso para o link de
   convite da story 13 (*universal links*).

## Fase 4 — Preparar o código

Esta fase é do Claude, num PR. Pode acontecer enquanto o D-U-N-S não sai.

- [ ] Identificador `com.prumoz.casa` em `ios.bundleIdentifier` e `android.package` (`app.json`).
- [ ] `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`.
  - O app só usa HTTPS.
  - Sem essa chave, todo build cai em *Missing Compliance* e fica parado até você responder o
    questionário.
- [ ] OTA ligado (`updates.enabled: true` + `updates.url`).
- [ ] Perfil `testflight` no `eas.json`: estende `production` e troca só o canal para `preview`.
- [ ] Seção OTA do README atualizada.

Depois do merge, faça **um APK novo**:

```bash
npx eas-cli build --platform android --profile preview
```

Com o identificador novo, o Android trata o APK como **outro app**. Instale o novo, apague o antigo e
faça login de novo; os dados estão no servidor.

## Fase 5 — Primeiro build iOS

```bash
cd ~/code/home-app/apps/mobile
# WSL: sem isto o eas trava em ETIMEDOUT (ver README, seção EAS)
export NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"
npx eas-cli login        # se ainda não estiver logado no Expo
npx eas-cli build --platform ios --profile testflight
```

O EAS faz algumas perguntas. Responda assim:

| Pergunta | Resposta |
|---|---|
| *Do you want to log in to your Apple account?* | **Yes**. Use o Apple ID da inscrição e o código de dois fatores |
| Seleção de *Team* | a equipe da **Prumoz** |
| *Generate a new Distribution Certificate / Provisioning Profile?* | **Yes**. O EAS cria e guarda as credenciais, e é isso que dispensa o Mac |
| *Generate a new Apple Push Notifications service key?* | **Yes**. A chave vai ser usada no Épico 5. A Apple permite poucas por equipe, então não gere de novo à toa |

Nesse primeiro build, o EAS **registra o bundle ID `com.prumoz.casa`** na Apple. Sem esse registro, o
App Store Connect não oferece o identificador na fase 6.

## Fase 6 — App no App Store Connect e envio

1. No [App Store Connect](https://appstoreconnect.apple.com), abra *Apps → + → New App*:
   - Plataforma: iOS.
   - **Nome**: precisa ser único na App Store inteira, e "Casa" sozinho provavelmente já foi usado.
     Use um nome provisório, como "Casa — gestão do lar". Ele muda de graça depois. O nome que aparece
     embaixo do ícone vem do `app.json`, não daqui.
   - Idioma principal: Português (Brasil).
   - Bundle ID: `com.prumoz.casa`, que aparece na lista depois da fase 5.
   - SKU: `casa`. É um texto interno, qualquer um serve.
2. Envie o build:
   ```bash
   npx eas-cli submit --platform ios --latest
   ```
   - Entre com o mesmo Apple ID.
   - O ID do app (`ascAppId`) fica em *App Information → Apple ID*. Vale gravar no `eas.json` para
     não precisar informar a cada envio.
3. Espere o e-mail *has completed processing*, que leva de minutos a cerca de 1 hora. O build aparece
   em *TestFlight*.

Nos builds seguintes, dá para compilar e enviar num comando só:
`npx eas-cli build -p ios --profile testflight --auto-submit`.

## Fase 7 — Instalação no iPhone dela

1. No App Store Connect, abra *Users and Access → +* e convide o Apple ID dela.
   - Escolha uma função de pouco acesso, como *Marketing*.
   - Limite o acesso ao app do Casa.
2. Ela aceita o convite pelo e-mail.
3. Abra *Apps → Casa → TestFlight → Internal Testing → +*, crie um grupo (por exemplo, "Casa") e
   adicione ela. Marque o build.
   - Teste interno **não passa por revisão da Apple**.
4. No iPhone, ela instala o app **TestFlight** da App Store, abre o convite e toca em **Instalar**.
5. Quando sair um build novo, o TestFlight avisa e ela toca em **Atualizar**.
   - Cada build expira em **90 dias**.
   - Não precisa de Modo Desenvolvedor.

## Fase 8 — Atualizações do dia a dia

| Mudou o quê | Como chega nos dois celulares |
|---|---|
| Só JavaScript ou TypeScript (telas, lógica, texto) | `npx eas-cli update --channel preview --message "o que mudou"` |
| Algo nativo: biblioteca nativa nova, versão do SDK, permissão, ícone, plugin no `app.json` | 1. subir `version` no `app.json`<br>2. build Android `preview`<br>3. build iOS `testflight` com `--auto-submit` |

O `runtimeVersion` segue a `version` do app (política `appVersion`). Por isso:

- um update só chega no build da mesma versão;
- esquecer de subir a versão numa mudança nativa entrega JavaScript a um binário que não o suporta, e o
  app quebra na abertura.

## Problemas conhecidos

| Sintoma | Causa | Saída |
|---|---|---|
| `eas` trava em `ETIMEDOUT` | IPv6 da WSL2 não volta | `NODE_OPTIONS` da fase 5 |
| Bundle ID não aparece no *New App* | o build da fase 5 ainda não rodou | rodar o build primeiro, que é ele que registra |
| Nome do app recusado | nome já usado na App Store | outro nome provisório |
| Build parado em *Missing Compliance* | falta `ITSAppUsesNonExemptEncryption` | conferir a fase 4, ou responder "não usa criptografia própria" no build |
| Ela não vê o build no TestFlight | build ainda processando, ou fora do grupo interno | esperar o e-mail; conferir o grupo |
| `eas update` não chega no celular | build feito antes do OTA ligado, ou de outra `version` | fazer build novo depois da fase 4 |

## Custos

| Item | Valor |
|---|---|
| Apple Developer Program | US$ 99/ano |
| D-U-N-S | grátis |
| EAS | plano gratuito; o build espera em fila |
| Google Play (quando o Android for para a loja) | US$ 25, uma vez; usa o mesmo D-U-N-S |

## Depois: lançar na App Store

O TestFlight interno não cobra o que a revisão da loja cobra. A lista do que falta está no Épico 6 do
[roadmap](../../casa-roadmap-implementacao.md#épico-6--polimento-mobile--pré-lançamento). O build do
lançamento sai do perfil `production`, no canal `production`.
