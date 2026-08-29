import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Fonte da verdade do schema (ADR-0005). O `.sql` sai do `drizzle-kit generate`;
 * policy, GRANT e `down.sql` são escritos à mão ao lado dele.
 *
 * Escopo do Épico 0a: o mínimo para exercitar o pipeline inteiro (migration →
 * RLS → grant → up/down/up). O Épico 1 estende — colunas de auth, `casas` e o
 * escopo por casa nas policies.
 */
export const moradores = pgTable('moradores', {
  /** Mesmo uuid que vira `app.current_user_id` na transação (ADR-0002). */
  id: uuid('id').primaryKey().defaultRandom(),
  apelido: text('apelido').notNull(),
  /** Token de cor do design system, não `#hex` — ver casa-ux-ui. */
  cor: text('cor').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export type Morador = typeof moradores.$inferSelect
export type NovoMorador = typeof moradores.$inferInsert
