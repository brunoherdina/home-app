import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import type { TextInputProps } from 'react-native'
import { Campo } from '../design-system/componentes/Campo'

type Props<T extends FieldValues> = TextInputProps & {
  control: Control<T>
  name: FieldPath<T>
  rotulo: string
}

/**
 * Cola entre o React Hook Form e o `Campo` do design system (ADR-0009).
 *
 * A mensagem de erro vem do resolver zod, que é o MESMO schema que a API valida
 * — a tela não repete a regra em lugar nenhum. Se a regra mudar no
 * `packages/contracts`, muda aqui sem edição.
 */
export function CampoDeTexto<T extends FieldValues>({
  control,
  name,
  rotulo,
  ...resto
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Campo
          rotulo={rotulo}
          value={field.value ?? ''}
          onChangeText={field.onChange}
          // Valida ao sair do campo, e não a cada tecla: acusar "e-mail
          // inválido" na terceira letra é ruído, não ajuda.
          onBlur={field.onBlur}
          erro={fieldState.error?.message}
          {...resto}
        />
      )}
    />
  )
}
