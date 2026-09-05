import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { loginSchema, type Login } from '@casa/contracts'
import { router } from 'expo-router'
import { useForm } from 'react-hook-form'
import { CampoDeTexto } from '../componentes/CampoDeTexto'
import { Aviso } from '../design-system/componentes/Aviso'
import { Botao } from '../design-system/componentes/Botao'
import { Tela } from '../design-system/componentes/Tela'
import { chaveDaSessao, entra } from '../lib/api/auth'
import { mensagemDoErro } from '../lib/erros'

/**
 * Os campos como o formulário os guarda — antes das transformações do schema
 * (o `trim`/`toLowerCase` do e-mail). O resolver entrega a versão já
 * normalizada ao `handleSubmit`, que é a que viaja para a API.
 */
type Formulario = { email: string; senha: string }

/**
 * A porta da casa: entrar ou criar conta.
 *
 * As duas ações ficam na mesma tela porque a Fase 0 tem orçamento de um minuto
 * e um menu "criar ou entrar" antes do formulário gasta um toque para não
 * decidir nada — quem chega aqui já sabe qual dos dois é.
 */
export default function Entrar() {
  const cache = useQueryClient()

  const { control, handleSubmit, formState } = useForm<Formulario, unknown, Login>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
    // Reprovar enquanto a pessoa digita o e-mail é ruído; ao sair do campo, não.
    mode: 'onBlur',
  })

  const login = useMutation({
    mutationFn: entra,
    onSuccess: () => {
      // O boot não precisa restaurar o que acabou de nascer.
      cache.setQueryData(chaveDaSessao, true)
      // Volta ao boot em vez de saltar direto: quem entra pode já ter casa
      // (voltando ao app) ou não (criou a conta e desinstalou antes), e a
      // decisão de rota já existe num lugar só.
      router.replace('/')
    },
  })

  return (
    <Tela
      titulo="Casa"
      legenda="Entre para voltar à sua casa."
      rodape={
        <>
          <Botao
            titulo="Entrar"
            aoTocar={handleSubmit((dados) => login.mutate(dados))}
            ocupado={login.isPending}
          />
          <Botao
            titulo="Criar conta"
            variante="texto"
            aoTocar={() => router.push('/criar-conta')}
            desabilitado={login.isPending}
          />
        </>
      }
    >
      {login.isError ? <Aviso mensagem={mensagemDoErro(login.error)} /> : null}

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
        autoComplete="current-password"
        textContentType="password"
        // Envia direto do teclado: o botão fica no rodapé e o teclado o cobre.
        returnKeyType="go"
        onSubmitEditing={handleSubmit((dados) => login.mutate(dados))}
      />

      {formState.isSubmitted && !formState.isValid ? (
        <Aviso tom="nota" mensagem="Confira os campos marcados acima." />
      ) : null}
    </Tela>
  )
}
