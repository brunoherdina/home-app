import {
  boolean,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

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

/**
 * Peso de esforço — três degraus, e não um número livre (decisão de escopo 2
 * do Épico 2). Quem digita "7" numa tarefa e "3" na outra está negociando
 * placar com quem mora junto, que é o atrito que o produto existe para
 * remover. Vira pontos no servidor (1 / 2 / 3), nunca no cliente.
 */
export const pesoDeTarefa = pgEnum('peso_de_tarefa', ['leve', 'medio', 'pesado'])

/**
 * Os três modos do manifesto §4: Rodízio gira entre moradores, Fixo tem dono,
 * Aberta qualquer um pega (é o filtro "Livres").
 */
export const modoDeTarefa = pgEnum('modo_de_tarefa', ['rodizio', 'fixo', 'aberta'])

/**
 * Tarefas da casa — semeadas pelo template ao criar a casa (Épico 1, story 6)
 * e, a partir do Épico 2, criadas e divididas pelas pessoas.
 *
 * Os defaults não são conveniência: são o que o template semeia. Tarefa nasce
 * `aberta` e sem responsável porque atribuir dono na Fase 0 transforma o
 * primeiro minuto do app numa divisão que ninguém combinou (templates.ts);
 * nasce `medio` porque é o único peso que não afirma nada.
 *
 * O que continua fora: `criado_por` (nenhum fluxo lê autoria de tarefa) e
 * qualquer coluna de conclusão — concluir é EVENTO, na tabela `conclusoes`
 * (decisão de escopo 1). Tarefa doméstica é recorrente por natureza: a louça
 * de hoje não "termina" a louça.
 */
export const tarefas = pgTable(
  'tarefas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Cascade: casa apagada não deixa tarefa órfã que policy nenhuma alcança. */
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id, { onDelete: 'cascade' }),
    titulo: text('titulo').notNull(),
    peso: pesoDeTarefa('peso').notNull().default('medio'),
    modo: modoDeTarefa('modo').notNull().default('aberta'),
    /**
     * Quem está da vez (Rodízio) ou o dono (Fixo). NULL em Aberta — o CHECK
     * `tarefa_aberta_sem_responsavel` (migration 0006, à mão) garante que
     * uma tarefa "que qualquer um pega" não tem alguém de posse dela.
     *
     * Nullable também em Rodízio/Fixo, de propósito: a FK é `set null`, e
     * uma conta apagada (LGPD, Épico 6) não pode falhar por deixar tarefa
     * sem ninguém. A rotação trata NULL como "começa do primeiro".
     *
     * A policy (0006) recusa responsável de OUTRA casa — no banco, não no
     * handler.
     */
    responsavelId: uuid('responsavel_id').references(() => moradores.id, {
      onDelete: 'set null',
    }),
    /**
     * Marcação MANUAL de "todo mundo detesta" (ADR-0010) — atributo da tarefa,
     * nunca da pessoa, é o que preserva a ausência de atribuição. Vale +2 a
     * quem está da vez, e só em Rodízio: o CHECK `bonus_so_em_rodizio` (0006)
     * impede que o bônus vire aumento permanente do dono (Fixo) ou corrida
     * por pontos (Aberta). No Épico 4 passa a ser derivada das preferências.
     */
    bonusDetestada: boolean('bonus_detestada').notNull().default(false),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  // Toda leitura de tarefa é escopada por casa (`casa_atual()`), então este
  // índice é o caminho da consulta, não otimização especulativa. "Minhas"
  // filtra por responsável DENTRO da casa — poucas linhas, sem índice próprio.
  (tabela) => [index('tarefas_casa_id_idx').on(tabela.casaId)],
)

/**
 * Conclusões — o evento "alguém fez esta tarefa", append-only.
 *
 * `pontos` é FOTO do momento (peso + bônus quando concluiu), não referência à
 * tarefa: mudar o peso da louça depois não reescreve o passado de quem já a
 * lavou. Calculado no servidor; o valor que o cliente mandar é ignorado.
 *
 * `casa_id` é redundante com `tarefas.casa_id` de propósito: é o predicado da
 * policy (`casa_id = casa_atual()`, ADR-0012) e o caminho da agregação de
 * "total da casa" — sem join com uma tabela que também está sob RLS.
 *
 * `morador_id` é `set null`, não cascade: a conta que sai (LGPD, Épico 6)
 * deixa a contribuição no coletivo, sem nome. O total da casa não encolhe
 * porque alguém foi embora — é a única leitura consistente com "coletivo
 * acima de individual".
 *
 * > [!danger] Esta tabela tem pontos POR PESSOA — matéria-prima de pódio.
 * > Ela alimenta duas leituras e nada mais: "sua parte" (a soma das MINHAS
 * > linhas) e o total da casa. Query que agrupa por `morador_id` e ordena é
 * > ranking mesmo sem tela (ADR-0010); a guarda é teste (story 8), não review.
 */
export const conclusoes = pgTable(
  'conclusoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Cascade: tarefa apagada leva o histórico dela — não há o que ler sem ela. */
    tarefaId: uuid('tarefa_id')
      .notNull()
      .references(() => tarefas.id, { onDelete: 'cascade' }),
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id, { onDelete: 'cascade' }),
    moradorId: uuid('morador_id').references(() => moradores.id, { onDelete: 'set null' }),
    pontos: smallint('pontos').notNull(),
    concluidaEm: timestamp('concluida_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabela) => [
    // As duas leituras que a tabela serve: total da casa (prefixo) e "sua
    // parte" (casa + morador). Um índice só por morador_id não existe de
    // propósito — não há leitura de "as linhas de fulano" fora da própria casa.
    index('conclusoes_casa_id_morador_id_idx').on(tabela.casaId, tabela.moradorId),
    // Cascade da tarefa e "última conclusão desta tarefa" (rotação).
    index('conclusoes_tarefa_id_idx').on(tabela.tarefaId),
  ],
)

/**
 * Convites por código curto — o ramo *tem convite* da Fase 0.
 *
 * O código é a PK: não há uuid além dele, porque não existe nada que aponte
 * para um convite. Uma coluna de id seria identificador sem referência, e o
 * código já é único por construção (32^6 e uso único).
 *
 * Uso único e não contador de vagas: convite é para UMA pessoa, e "quantas
 * vezes ainda dá para usar" é estado que só faz sentido quando a casa tiver
 * papéis — o que não é o v1 (ADR-0012). Reenviar é gerar outro.
 *
 * Sem `usado_por` e sem `revogado_em`: nenhum fluxo lê os dois. Cancelar
 * convite e "quem entrou por qual código" chegam junto com a tela que os
 * mostra — coluna sem fluxo envelhece errado, a mesma regra que manteve
 * frustração e aspiração fora do schema.
 */
export const convites = pgTable(
  'convites',
  {
    /** Normalizado pelo contrato (maiúsculo, sem separador) antes de chegar. */
    codigo: text('codigo').primaryKey(),
    /** Cascade: casa apagada não deixa convite que abriria porta para o nada. */
    casaId: uuid('casa_id')
      .notNull()
      .references(() => casas.id, { onDelete: 'cascade' }),
    /**
     * Quem convidou. Cascade pelo mesmo motivo do `casa_id`: conta apagada
     * (LGPD, Épico 6) não deixa convite vivo emitido por ninguém.
     */
    criadoPor: uuid('criado_por')
      .notNull()
      .references(() => moradores.id, { onDelete: 'cascade' }),
    /**
     * Validade curta é metade da proteção do código (a outra é o rate limit
     * do aceite): reduz a janela em que um código vazado — print, conversa
     * arquivada — ainda abre a casa.
     */
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    /** Timestamp e não boolean: "quando" responde suporte, "se" não. */
    usadoEm: timestamp('usado_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  // Toda leitura por casa_app é escopada por casa (`casa_atual()`); a busca
  // pelo código é PK e não precisa de índice.
  (tabela) => [index('convites_casa_id_idx').on(tabela.casaId)],
)

export type Casa = typeof casas.$inferSelect
export type NovaCasa = typeof casas.$inferInsert
export type Morador = typeof moradores.$inferSelect
export type NovoMorador = typeof moradores.$inferInsert
export type Sessao = typeof sessoes.$inferSelect
export type NovaSessao = typeof sessoes.$inferInsert
export type RevokedToken = typeof revokedTokens.$inferSelect
export type NovoRevokedToken = typeof revokedTokens.$inferInsert
export type Tarefa = typeof tarefas.$inferSelect
export type NovaTarefa = typeof tarefas.$inferInsert
export type Conclusao = typeof conclusoes.$inferSelect
export type NovaConclusao = typeof conclusoes.$inferInsert
export type Convite = typeof convites.$inferSelect
export type NovoConvite = typeof convites.$inferInsert
