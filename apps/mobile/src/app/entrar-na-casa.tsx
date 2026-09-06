import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TAMANHO_DO_CODIGO,
  entrarComCodigoSchema,
  type EntrarComCodigo,
} from '@casa/contracts'
import { router } from 'expo-router'
import { useForm } from 'react-hook-form'
import { CampoDeTexto } from '../componentes/CampoDeTexto'
import { Aviso } from '../design-system/componentes/Aviso'
import { Botao } from '../design-system/componentes/Botao'
import { Tela } from '../design-system/componentes/Tela'
import { chaveDaCasa } from '../lib/api/casa'
import { entraComCodigo } from '../lib/api/convite'
import { mensagemDoErro } from '../lib/erros'

type Formulario = { codigo: string }

/**
 * O ramo *tem convite* da Fase 0 — a outra saída de quem tem conta e não tem
 * casa.
 *
 * Uma pergunta só, e nenhuma escolha de apelido ou cor: quem chega aqui já
 * respondeu as duas no cadastro. A casa em que se entra também não pergunta
 * nome nem tipo — ela já existe, com as tarefas dela.
 */
export default function EntrarNaCasa() {
  const cache = useQueryClient()

  const { control, handleSubmit } = useForm<Formulario, unknown, EntrarComCodigo>({
    resolver: zodResolver(entrarComCodigoSchema),
    defaultValues: { codigo: '' },
    // `onSubmit` e não `onBlur`: um código de seis caracteres fica inválido
    // durante toda a digitação, e marcar o campo de vermelho na primeira saída
    // do teclado seria acusar erro de quem ainda está no meio.
    mode: 'onSubmit',
  })

  const entrada = useMutation({
    mutationFn: entraComCodigo,
    onSuccess: async () => {
      // Invalida em vez de escrever: `POST /casas/entrar` devolve a casa, não a
      // casa POVOADA — quem sabe as tarefas e quem já mora nela é o servidor.
      await cache.invalidateQueries({ queryKey: chaveDaCasa })
      router.replace('/casa')
    },
  })

  const enviar = handleSubmit((dados) => entrada.mutate(dados))

  return (
    <Tela
      titulo="Entrar numa casa"
      legenda="Digite o código que quem já mora lá te mandou."
      rodape={<Botao titulo="Entrar" aoTocar={() => void enviar()} ocupado={entrada.isPending} />}
    >
      {entrada.isError ? <Aviso mensagem={mensagemDoErro(entrada.error)} /> : null}

      <CampoDeTexto
        control={control}
        name="codigo"
        rotulo="Código do convite"
        placeholder="A1B2C3"
        // `characters` e não `none`: o código é sempre maiúsculo, e deixar o
        // teclado em minúsculas faria a pessoa ver na tela algo diferente do
        // que recebeu — mesmo o schema normalizando os dois para a mesma coisa.
        autoCapitalize="characters"
        autoCorrect={false}
        // Folga sobre o tamanho exato: quem cola do WhatsApp traz hífen ou
        // espaço, e o schema os remove. Cortar em 6 mutilaria a colagem.
        maxLength={TAMANHO_DO_CODIGO + 4}
        returnKeyType="go"
        onSubmitEditing={() => void enviar()}
      />

      <Aviso
        tom="nota"
        mensagem="O código vale para uma pessoa só. Se não funcionar, peça outro."
      />
    </Tela>
  )
}
