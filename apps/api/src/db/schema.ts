import { index, pgEnum, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core'

/**
 * Fonte da verdade do schema (ADR-0005). O `.sql` sai do `drizzle-kit generate`;
 * policy, GRANT e `down.sql` são escritos à mão ao lado dele.
 *
 * Épico 1, leva 1: identidade (ADR-0012), credencial e sessões (ADR-0008,
 * ADR-0013). As tabelas sensíveis (frustração/aspiração/pulso) NÃO nascem aqui
 * de propósito — o DDL delas chega no Épico 4, junto com quem escreve nelas
 * (decisão registrada no roadmap: tabela fantasma envelhece errado).
 */

/**
 * Cada tipo tem um template de tarefas que o backend semeia ao criar a casa
 * (Épico 1, story 6). Tipo novo aqui sem template correspondente é casa
 * nascendo vazia — os dois andam juntos, no mesmo PR (ver contracts/casa.ts).
 */
export const tipoDeCasa = pgEnum('tipo_de_casa', ['casal', 'republica', 'familia'])

export const casas = pgTable('casas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  tipo: tipoDeCasa('tipo').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const moradores = pgTable(
  'moradores',
  {
    /** Mesmo uuid que vira `app.current_user_id` na transação (ADR-0002). */
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Nullable de propósito: no register a conta nasce ANTES de existir casa
     * (Fase 0, ramo do criador). Uma casa por conta no v1 (ADR-0012) — por isso
     * a coluna mora aqui e não numa tabela de vínculo.
     */
    casaId: uuid('casa_id').references(() => casas.id),
    apelido: text('apelido').notNull(),
    /** Token de cor do design system, não `#hex` — ver casa-ux-ui. */
    cor: text('cor').notNull(),
    /** Normalizado (trim + minúsculas) no contract ANTES de chegar aqui. */
    email: text('email').notNull().unique(),
    /** Nullable: conta social (Google/Apple) não tem senha local (ADR-0003). */
    hashSenha: text('hash_senha'),
    googleSub: text('google_sub').unique(),
    /**
     * Apple Sign In só entra no Épico 6 (exige conta paga + build iOS), mas a
     * coluna nasce agora para não virar migration de identidade depois.
     */
    appleSub: text('apple_sub').unique(),
    /** O token de 24 h é gerado no Épico 1; o TRANSPORTE do e-mail é Épico 0b. */
    emailVerificadoEm: timestamp('email_verificado_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // A policy "mesma casa" (ADR-0012) filtra por casa_id em toda leitura.
    index('moradores_casa_id_idx').on(tabela.casaId),
  ],
)

/**
 * Refresh tokens com rotação (ADR-0008). Uma linha por refresh emitido; a
 * "sessão" do ponto de vista do usuário é a FAMÍLIA, não a linha.
 */
export const sessoes = pgTable(
  'sessoes',
  {
    /**
     * O `jti` do refresh token assinado — PK natural. Sem defaultRandom: quem
     * gera o id é quem assina o JWT, e o banco só registra; um default aqui
     * abriria espaço para linha órfã que nenhum token consegue referenciar.
     */
    jti: uuid('jti').primaryKey(),
    /** Cascade: exclusão de conta (LGPD, Épico 6) leva as sessões junto. */
    moradorId: uuid('morador_id')
      .notNull()
      .references(() => moradores.id, { onDelete: 'cascade' }),
    /**
     * Cadeia de rotação: o login abre uma família e cada refresh herda o id.
     * Reuso detectado fora da janela de graça revoga TODAS as linhas da
     * família numa query só — sem precisar caminhar a cadeia token a token.
     */
    familiaId: uuid('familia_id').notNull(),
    /**
     * O sucessor emitido na rotação. Com `consumida_em`, viabiliza a janela de
     * graça de ~30 s: reuso logo após o consumo devolve o MESMO par sucessor
     * (relido por este ponteiro) em vez de revogar a família — dois requests
     * paralelos com o mesmo refresh não deslogam ninguém. `set null` para o
     * worker de limpeza poder apagar expirados sem ordem obrigatória.
     */
    substituidaPor: uuid('substituida_por').references((): AnyPgColumn => sessoes.jti, {
      onDelete: 'set null',
    }),
    /**
     * Quando o refresh foi usado na rotação. Consumo é o caminho FELIZ; o
     * sinal de vazamento é reuso de token já consumido além da graça — por
     * isso é timestamp, não boolean: a janela se mede contra ele.
     */
    consumidaEm: timestamp('consumida_em', { withTimezone: true }),
    /** Vida do refresh (30–90 d). Indexado para a limpeza do worker de cron. */
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    /**
     * Revogação explícita (logout, revogação de família). Separado de
     * `consumida_em` porque consumo é rotação normal e revogação é
     * encerramento — colapsar os dois esconderia o próprio sinal de reuso.
     */
    revogadaEm: timestamp('revogada_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    index('sessoes_familia_id_idx').on(tabela.familiaId),
    index('sessoes_expira_em_idx').on(tabela.expiraEm),
  ],
)

/**
 * Blocklist de `jti` de ACCESS token (ADR-0003, delta 2 — Postgres no lugar do
 * Redis do improvisa-ai). Linha existe = token revogado antes de expirar
 * (logout). TTL implícito: o worker de cron apaga o que passou de `expira_em`.
 */
export const revokedTokens = pgTable(
  'revoked_tokens',
  {
    jti: uuid('jti').primaryKey(),
    /** Igual ao `exp` do access revogado: depois disso a linha é lixo coletável. */
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  },
  (tabela) => [index('revoked_tokens_expira_em_idx').on(tabela.expiraEm)],
)

export type Casa = typeof casas.$inferSelect
export type NovaCasa = typeof casas.$inferInsert
export type Morador = typeof moradores.$inferSelect
export type NovoMorador = typeof moradores.$inferInsert
export type Sessao = typeof sessoes.$inferSelect
export type NovaSessao = typeof sessoes.$inferInsert
export type RevokedToken = typeof revokedTokens.$inferSelect
export type NovoRevokedToken = typeof revokedTokens.$inferInsert
