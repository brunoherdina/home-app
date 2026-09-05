import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { criarCasaSchema, type CriarCasa, type TipoDeCasa } from '@casa/contracts'
import { router } from 'expo-router'
import { useForm } from 'react-hook-form'
import { CampoDeTexto } from '../componentes/CampoDeTexto'
import { EscolhaDeChips } from '../componentes/EscolhaDeChips'
import { Aviso } from '../design-system/componentes/Aviso'
import { Botao } from '../design-system/componentes/Botao'
import type { Opcao } from '../design-system/componentes/Chips'
import { Tela } from '../design-system/componentes/Tela'
import { chaveDaCasa, criaCasa } from '../lib/api/casa'
import { mensagemDoErro } from '../lib/erros'

type Formulario = { nome: string; tipo: TipoDeCasa }

/**
 * O tipo escolhe o template de tarefas que o backend semeia (story 6) — é a
 * única pergunta da Fase 0 cuja resposta muda o que aparece na tela seguinte.
 */
const TIPOS: readonly TipoDeCasa[] = ['casal', 'republica', 'familia']

const NOMES_DE_TIPO: Record<TipoDeCasa, string> = {
  casal: 'Casal',
  republica: 'República',
  familia: 'Família',
}

const OPCOES_DE_TIPO: readonly Opcao<TipoDeCasa>[] = TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: NOMES_DE_TIPO[tipo],
}))

/**
 * Segundo e último passo do ramo do criador.
 *
 * Não há botão de voltar (ver o `_layout`): a conta já existe e voltar cairia
 * no cadastro, que só responderia 409. Também não há "pular": uma conta sem
 * casa não tem nenhuma tela para onde ir — é o estado que o boot resolve
 * mandando exatamente para cá.
 */
export default function NovaCasa() {
  const cache = useQueryClient()

  const { control, handleSubmit, formState } = useForm<Formulario, unknown, CriarCasa>({
    resolver: zodResolver(criarCasaSchema),
    defaultValues: { nome: '', tipo: 'casal' },
    mode: 'onBlur',
  })

  const criacao = useMutation({
    mutationFn: criaCasa,
    onSuccess: async () => {
      // Invalida em vez de escrever o retorno no cache: `POST /casas` devolve a
      // casa, não a casa POVOADA — quem sabe o que o template semeou é o
      // servidor. `await` para a próxima tela já abrir com os dados na mão, em
      // vez de piscar um estado de carregando recém-criado.
      await cache.invalidateQueries({ queryKey: chaveDaCasa })
      router.replace('/casa')
    },
  })

  const enviar = handleSubmit((dados) => criacao.mutate(dados))

  return (
    <Tela
      titulo="Sua casa"
      legenda="Ela já vai nascer com algumas tarefas — dá para mudar tudo depois."
      rodape={
        <Botao titulo="Criar casa" aoTocar={() => void enviar()} ocupado={criacao.isPending} />
      }
    >
      {criacao.isError ? <Aviso mensagem={mensagemDoErro(criacao.error)} /> : null}

      <CampoDeTexto
        control={control}
        name="nome"
        rotulo="Nome da casa"
        autoCapitalize="words"
        maxLength={48}
        placeholder="Casa da Ana e do Bruno"
        returnKeyType="go"
        onSubmitEditing={() => void enviar()}
      />

      <EscolhaDeChips control={control} name="tipo" rotulo="Tipo de casa" opcoes={OPCOES_DE_TIPO} />

      {formState.isSubmitted && !formState.isValid ? (
        <Aviso mensagem="Confira os campos marcados acima." />
      ) : null}
    </Tela>
  )
}
