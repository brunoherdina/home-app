import { saudeSchema, type Saude } from '@casa/contracts'
import { requisita } from './cliente'

export function buscaSaude(): Promise<Saude> {
  return requisita('/api/saude', { valida: (dado) => saudeSchema.parse(dado) })
}
