import { zodResolver } from '@hookform/resolvers/zod'
import {
  BONUS_DA_TAREFA_DETESTADA,
  PONTOS_POR_PESO,
  criarTarefaSchema,
  type CriarTarefa,
  type ModoDeTarefa,
  type MoradorPublico,
  type PesoDeTarefa,
} from '@casa/contracts'
import type { ReactNode } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { Aviso } from '../../design-system/componentes/Aviso'
import { Botao } from '../../design-system/componentes/Botao'
import { Chips, type Opcao } from '../../design-system/componentes/Chips'
import { Tela } from '../../design-system/componentes/Tela'
import { cores, espacos, textos, type Cor } from '../../design-system/tokens'
import { CampoDeTexto } from '../CampoDeTexto'
import { EscolhaDeChips } from '../EscolhaDeChips'
import { EXPLICACAO_DO_MODO, NOMES_DE_MODO, NOMES_DE_PESO, pontosPorExtenso } from './rotulos'

/** Os cinco campos, todos presentes — editar é mandar o formulário inteiro. */
export type FormularioDaTarefa = {
  titulo: string
  peso: PesoDeTarefa
  modo: ModoDeTarefa
  responsavelId: string | null
  bonusDetestada: boolean
}

/** Os defaults do contrato (e do template): aberta, médio, sem dono, sem bônus. */
export const TAREFA_EM_BRANCO: FormularioDaTarefa = {
  titulo: '',
  peso: 'medio',
  modo: 'aberta',
  responsavelId: null,
  bonusDetestada: false,
}

const PESOS: readonly PesoDeTarefa[] = ['leve', 'medio', 'pesado']
const MODOS: readonly ModoDeTarefa[] = ['aberta', 'rodizio', 'fixo']

const OPCOES_DE_PESO: readonly Opcao<PesoDeTarefa>[] = PESOS.map((peso) => ({
  valor: peso,
  rotulo: `${NOMES_DE_PESO[peso]} · ${pontosPorExtenso(PONTOS_POR_PESO[peso])}`,
}))

const OPCOES_DE_MODO: readonly Opcao<ModoDeTarefa>[] = MODOS.map((modo) => ({
  valor: modo,
  rotulo: NOMES_DE_MODO[modo],
}))

/**
 * O schema tem defaults, então a ENTRADA dele tem os cinco campos opcionais —
 * e o formulário sempre manda os cinco. Um resolver que aceita a entrada mais
 * larga aceita a mais estreita; o cast só diz isso ao TypeScript, que compara
 * os dois tipos de `Resolver` como invariantes.
 */
const resolverDaTarefa = zodResolver(criarTarefaSchema) as unknown as Resolver<
  FormularioDaTarefa,
  unknown,
  CriarTarefa
>

type Props = {
  titulo: string
  valoresIniciais: FormularioDaTarefa
  moradores: readonly MoradorPublico[]
  euId: string
  rotuloDoEnvio: string
  aoEnviar: (dados: CriarTarefa) => void
  enviando: boolean
  erro?: string
  /** Ações a mais no rodapé — apagar, na edição. */
  rodapeExtra?: ReactNode
}

/**
 * A tela de tarefa (story 11), igual para criar e editar.
 *
 * O resolver é `criarTarefaSchema` — o MESMO que a API roda (ADR-0009). As
 * duas regras cruzadas dele (aberta sem dono, bônus só em rodízio) aparecem
 * no campo certo se forem violadas; o formulário faz o possível para que não
 * sejam: trocar o modo arruma os campos que dependem dele, e o bônus só é
 * oferecido em Rodízio — marcar detestada fora dele não existe como opção.
 *
 * Quem é responsável é uma lista dos moradores da casa, e isso é conforto,
 * não autoridade: responsável de outra casa é recusado pela policy (0006).
 */
export function FormularioDeTarefa({
  titulo,
  valoresIniciais,
  moradores,
  euId,
  rotuloDoEnvio,
  aoEnviar,
  enviando,
  erro,
  rodapeExtra,
}: Props) {
  const { control, handleSubmit, setValue, getValues, watch, formState } = useForm<
    FormularioDaTarefa,
    unknown,
    CriarTarefa
  >({
    resolver: resolverDaTarefa,
    defaultValues: valoresIniciais,
    mode: 'onBlur',
  })

  const modo = watch('modo')
  const enviar = handleSubmit(aoEnviar)

  const opcoesDeResponsavel: readonly Opcao<string>[] = moradores.map((morador) => ({
    valor: morador.id,
    rotulo: morador.id === euId ? `${morador.apelido} (você)` : morador.apelido,
    amostra: cores[morador.cor as Cor] ?? cores.cinza,
  }))

  /**
   * Trocar o modo leva junto o que só faz sentido nele: Aberta solta o dono,
   * sair de Rodízio desliga o bônus, e entrar em Rodízio/Fixo sem ninguém
   * começa por quem está criando — a escolha mais provável, e um toque para
   * mudar.
   */
  function trocaModo(novo: ModoDeTarefa) {
    const validar = { shouldValidate: formState.isSubmitted }
    setValue('modo', novo, validar)
    if (novo === 'aberta') setValue('responsavelId', null, validar)
    else if (getValues('responsavelId') === null) setValue('responsavelId', euId, validar)
    if (novo !== 'rodizio') setValue('bonusDetestada', false, validar)
  }

  return (
    <Tela
      titulo={titulo}
      rodape={
        <>
          <Botao titulo={rotuloDoEnvio} aoTocar={() => void enviar()} ocupado={enviando} />
          {rodapeExtra}
        </>
      }
    >
      {erro ? <Aviso mensagem={erro} /> : null}

      <CampoDeTexto
        control={control}
        name="titulo"
        rotulo="Tarefa"
        autoCapitalize="sentences"
        maxLength={64}
        placeholder="Lavar a louça"
      />

      <EscolhaDeChips control={control} name="peso" rotulo="Esforço" opcoes={OPCOES_DE_PESO} />

      <Controller
        control={control}
        name="modo"
        render={({ field, fieldState }) => (
          <View style={estilos.grupo}>
            <Chips
              rotulo="Como dividir"
              opcoes={OPCOES_DE_MODO}
              valor={field.value}
              aoEscolher={trocaModo}
              erro={fieldState.error?.message}
            />
            <Text style={estilos.explicacao}>{EXPLICACAO_DO_MODO[field.value]}</Text>
          </View>
        )}
      />

      {modo !== 'aberta' ? (
        <Controller
          control={control}
          name="responsavelId"
          render={({ field, fieldState }) => (
            <Chips
              rotulo={modo === 'rodizio' ? 'De quem é a vez agora' : 'Com quem fica'}
              opcoes={opcoesDeResponsavel}
              valor={field.value ?? undefined}
              aoEscolher={field.onChange}
              erro={fieldState.error?.message}
            />
          )}
        />
      ) : null}

      {modo === 'rodizio' ? (
        <Controller
          control={control}
          name="bonusDetestada"
          render={({ field, fieldState }) => (
            <View style={estilos.grupo}>
              <View style={estilos.linhaDoBonus}>
                <Text style={estilos.rotuloDoBonus}>Todo mundo detesta esta tarefa</Text>
                <Switch
                  accessibilityLabel="Todo mundo detesta esta tarefa"
                  value={field.value}
                  onValueChange={field.onChange}
                  trackColor={{ true: cores.amber, false: cores.cinza }}
                  thumbColor={cores.papel}
                />
              </View>
              <Text style={estilos.explicacao}>
                Quem fizer ganha +{pontosPorExtenso(BONUS_DA_TAREFA_DETESTADA)} de bônus. Só existe no
                rodízio, para a tarefa ruim girar entre todos.
              </Text>
              {fieldState.error ? <Text style={estilos.erro}>{fieldState.error.message}</Text> : null}
            </View>
          )}
        />
      ) : null}
    </Tela>
  )
}

const estilos = StyleSheet.create({
  grupo: { gap: espacos.xs },
  explicacao: { ...textos.legenda, color: cores.cinza },
  linhaDoBonus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rotuloDoBonus: { ...textos.corpo, color: cores.tinta, flexShrink: 1 },
  erro: { ...textos.legenda, color: cores.coral },
})
