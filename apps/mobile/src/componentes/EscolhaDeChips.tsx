import {
  Controller,
  type Control,
  type FieldPath,
  type FieldPathValue,
  type FieldValues,
} from 'react-hook-form'
import { Chips, type Opcao } from '../design-system/componentes/Chips'

type Props<T extends FieldValues, N extends FieldPath<T>> = {
  control: Control<T>
  name: N
  rotulo: string
  opcoes: readonly Opcao<Extract<FieldPathValue<T, N>, string>>[]
}

/** Mesma cola do `CampoDeTexto`, para os campos de escolha única. */
export function EscolhaDeChips<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  rotulo,
  opcoes,
}: Props<T, N>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Chips
          rotulo={rotulo}
          opcoes={opcoes}
          valor={field.value}
          aoEscolher={field.onChange}
          erro={fieldState.error?.message}
        />
      )}
    />
  )
}
