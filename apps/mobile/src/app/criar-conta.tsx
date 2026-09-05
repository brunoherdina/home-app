import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { registroSchema, type Registro } from '@casa/contracts'
import { router } from 'expo-router'
import { useForm } from 'react-hook-form'
import { CampoDeTexto } from '../componentes/CampoDeTexto'
import { EscolhaDeChips } from '../componentes/EscolhaDeChips'
import { Aviso } from '../design-system/componentes/Aviso'
import { Botao } from '../design-system/componentes/Botao'
import type { Opcao } from '../design-system/componentes/Chips'
import { Tela } from '../design-system/componentes/Tela'
import { cores, coresDeMorador, type CorDeMorador } from '../design-system/tokens'
import { chaveDaSessao, registra } from '../lib/api/auth'
import { chaveDaCasa } from '../lib/api/casa'
import { ErroDaApi } from '../lib/api/cliente'
import { mensagemDoErro } from '../lib/erros'

type Formulario = { apelido: string; cor: string; email: string; senha: string }

/**
 * O nome de cada cor é copy de produto, não token — por isso mora aqui e não em
 * `design-system/tokens.ts`, que é a fonte dos VALORES. A amostra vem do token;
 * o que é gravado em `moradores.cor` é o nome dele, nunca o hex
 * (contracts/morador.ts).
 */
const NOMES_DE_COR: Record<CorDeMorador, string> = {
  moss: 'Musgo',
  amber: 'Âmbar',
  coral: 'Coral',
  lime: 'Limão',
}

const OPCOES_DE_COR: readonly Opcao<string>[] = coresDeMorador.map((cor) => ({
  valor: cor,
  rotulo: NOMES_DE_COR[cor],
  amostra: cores[cor],
}))

/**
 * Cadastro do criador da Fase 0: apelido, cor, e-mail e senha numa tela só.
 *
 * Um passo por campo daria uma sensação de progresso e custaria quatro toques
 * de navegação dentro de um fluxo cujo critério de aceite é um minuto no total.
 * A cor entra aqui, e não depois, porque `moradores.cor` é `NOT NULL` — adiar a
 * escolha obrigaria o backend a inventar um default (ver contracts/auth.ts).
 *
 * Login com Google fica de fora: não há client id configurado, e um botão que
 * não funciona é pior que um botão ausente.
 */
export default function CriarConta() {
  const cache = useQueryClient()

  const { control, handleSubmit, setError, formState } = useForm<Formulario, unknown, Registro>({
    resolver: zodResolver(registroSchema),
    defaultValues: { apelido: '', cor: coresDeMorador[0], email: '', senha: '' },
    mode: 'onBlur',
  })

  const cadastro = useMutation({
    mutationFn: registra,
    onSuccess: () => {
      cache.setQueryData(chaveDaSessao, true)
      // Conta recém-criada nasce sem casa (ADR-0012) — o boot não precisa
      // perguntar ao servidor algo que este fluxo acabou de determinar.
      cache.setQueryData(chaveDaCasa, null)
      router.replace('/nova-casa')
    },
    onError: (erro) => {
      // Conflito de unicidade é erro DAQUELE campo: como faixa no topo, a
      // pessoa relê os quatro campos procurando qual deles ofendeu.
      if (erro instanceof ErroDaApi && erro.codigo === 'EMAIL_EM_USO') {
        setError('email', { message: erro.message })
      }
    },
  })

  const enviar = handleSubmit((dados) => cadastro.mutate(dados))

  // O erro de e-mail em uso já está no campo; repeti-lo na faixa seria dizer a
  // mesma coisa duas vezes.
  const erroGeral =
    cadastro.error instanceof ErroDaApi && cadastro.error.codigo === 'EMAIL_EM_USO'
      ? null
      : cadastro.error

  return (
    <Tela
      titulo="Quem é você na casa?"
      legenda="Seu apelido e sua cor são como os outros moradores vão te reconhecer."
      rodape={
        <Botao titulo="Criar conta" aoTocar={() => void enviar()} ocupado={cadastro.isPending} />
      }
    >
      {erroGeral ? <Aviso mensagem={mensagemDoErro(erroGeral)} /> : null}

      <CampoDeTexto
        control={control}
        name="apelido"
        rotulo="Apelido"
        autoCapitalize="words"
        autoComplete="nickname"
        maxLength={32}
        placeholder="Como te chamam em casa"
      />

      <EscolhaDeChips control={control} name="cor" rotulo="Sua cor" opcoes={OPCOES_DE_COR} />

      <CampoDeTexto
        control={control}
        name="email"
        rotulo="E-mail"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="voce@exemplo.com"
      />

      <CampoDeTexto
        control={control}
        name="senha"
        rotulo="Senha"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void enviar()}
      />
      {/* A regra vem do schema compartilhado; o texto abaixo só a antecipa,
          para a pessoa não descobrir o mínimo errando. */}
      <Aviso tom="nota" mensagem="Pelo menos 12 caracteres. Uma frase que você lembre serve." />

      {formState.isSubmitted && !formState.isValid ? (
        <Aviso mensagem="Confira os campos marcados acima." />
      ) : null}
    </Tela>
  )
}
