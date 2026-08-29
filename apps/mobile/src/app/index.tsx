import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { buscaSaude } from '../lib/api/saude'
import { baseUrl } from '../lib/api/cliente'
import { cores, espacos, textos } from '../design-system/tokens'

/**
 * Tela de andaimes do Épico 0a. Não é produto: existe para provar que o
 * caminho app → lib/api → Fastify → Postgres fecha no device físico, e que o
 * pool responde como `casa_app`.
 *
 * A primeira tela de verdade é o criador da Fase 0 (Épico 1).
 */
export default function Inicio() {
  const [estado, setEstado] = useState<string>('conectando…')
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    buscaSaude()
      .then((saude) => {
        setEstado(`banco ${saude.banco} · Postgres ${saude.versao}`)
        setRole(saude.role)
      })
      .catch((erro: Error) => setEstado(`sem API: ${erro.message}`))
  }, [])

  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Casa</Text>
      <Text style={estilos.corpo}>{estado}</Text>
      {role ? (
        <Text style={role === 'casa_app' ? estilos.ok : estilos.alerta}>
          {role === 'casa_app'
            ? 'pool conectado como casa_app'
            : `pool conectado como ${role} — ADR-0002 violado`}
        </Text>
      ) : null}
      <Text style={estilos.legenda}>{baseUrl}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacos.sm,
    padding: espacos.lg,
    backgroundColor: cores.papel,
  },
  titulo: { ...textos.titulo, color: cores.moss },
  corpo: { ...textos.corpo, color: cores.tinta },
  ok: { ...textos.corpo, color: cores.lime },
  alerta: { ...textos.corpo, color: cores.coral },
  legenda: { ...textos.legenda, color: cores.cinza },
})
