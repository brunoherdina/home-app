import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { Convite as ConviteDaApi } from '@casa/contracts'
import { Alert, Share, StyleSheet, Text, View } from 'react-native'
import { Aviso } from '../design-system/componentes/Aviso'
import { Botao } from '../design-system/componentes/Botao'
import { cores, espacos, raios, textos } from '../design-system/tokens'
import { cancelaConvite, geraConvite } from '../lib/api/convite'
import { mensagemDoErro } from '../lib/erros'
import { validadeDoConvite } from './validadeDoConvite'

/**
 * Gerar e mandar um código de convite — na aba Casa e no primeiro passo da
 * Fase 1, o mesmo componente nos dois lugares.
 *
 * O convite não é gerado no `mount`: abrir a tela não deve emitir código.
 * Cada toque em "Convidar" gera um — ver `lib/api/convite.ts`.
 */
export function Convite() {
  const convite = useMutation({ mutationFn: geraConvite })
  const [cancelado, setCancelado] = useState(false)
  const cancelamento = useMutation({
    mutationFn: cancelaConvite,
    onSuccess: () => {
      convite.reset()
      setCancelado(true)
    },
  })

  function gera() {
    setCancelado(false)
    cancelamento.reset()
    convite.mutate()
  }

  return (
    <View style={estilos.grupo}>
      {convite.data ? (
        <ConviteGerado
          convite={convite.data}
          aoCancelar={() => cancelamento.mutate(convite.data.codigo)}
          cancelando={cancelamento.isPending}
        />
      ) : (
        <Text style={estilos.nota}>
          {cancelado
            ? 'Código cancelado. Ele não abre mais a casa.'
            : 'Gere um código e mande para quem mora com você. Ele vale para uma pessoa.'}
        </Text>
      )}
      {convite.isError ? <Aviso mensagem={mensagemDoErro(convite.error)} /> : null}
      {cancelamento.isError ? <Aviso mensagem={mensagemDoErro(cancelamento.error)} /> : null}
      <Botao
        titulo={convite.data ? 'Gerar outro código' : 'Convidar alguém'}
        variante="texto"
        aoTocar={gera}
        ocupado={convite.isPending}
      />
    </View>
  )
}

/**
 * O código, grande e espaçado, com o caminho mais curto para o WhatsApp.
 *
 * `letterSpacing` não é enfeite: o código é DITADO tanto quanto colado, e
 * caracteres grudados são onde se lê `0` por `O` — a confusão que o alfabeto do
 * contrato já evita na geração e que a tipografia não deve reintroduzir.
 *
 * `Share` nativo e não um botão de copiar: copiar exige a pessoa abrir o
 * WhatsApp, achar a conversa e colar; a folha nativa faz os três. O texto vai
 * junto com uma frase porque um código solto na conversa não se explica.
 *
 * Cancelar pede confirmação: o código talvez já esteja numa conversa, e quem o
 * recebeu vai dar com "código inválido" sem saber por quê.
 */
function ConviteGerado({
  convite,
  aoCancelar,
  cancelando,
}: {
  convite: ConviteDaApi
  aoCancelar: () => void
  cancelando: boolean
}) {
  const { codigo, expiraEm } = convite
  const validade = validadeDoConvite(expiraEm)

  function confirmaCancelamento() {
    Alert.alert(
      `Cancelar o código ${codigo}?`,
      'Se você já mandou para alguém, a pessoa não vai conseguir entrar com ele.',
      [
        { text: 'Manter', style: 'cancel' },
        { text: 'Cancelar código', style: 'destructive', onPress: aoCancelar },
      ],
    )
  }

  return (
    <View style={estilos.convite}>
      <Text style={estilos.codigo} accessibilityLabel={`Código ${codigo.split('').join(' ')}`}>
        {codigo}
      </Text>
      <Text style={estilos.nota}>Vale até {validade}, para uma pessoa.</Text>
      <Botao
        titulo="Compartilhar"
        variante="texto"
        aoTocar={() => {
          void Share.share({
            message: `Entra na nossa casa no Casa com o código ${codigo}. Vale até ${validade}.`,
          })
        }}
      />
      <Botao
        titulo="Cancelar este código"
        variante="texto"
        aoTocar={confirmaCancelamento}
        ocupado={cancelando}
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  grupo: { gap: espacos.sm },
  convite: {
    alignItems: 'center',
    gap: espacos.xs,
    padding: espacos.md,
    borderRadius: raios.md,
    borderWidth: 1,
    borderColor: cores.moss,
  },
  codigo: { ...textos.titulo, color: cores.moss, letterSpacing: 6 },
  nota: { ...textos.legenda, color: cores.cinza },
})
