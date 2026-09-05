import type { TipoDeCasa } from '@casa/contracts'

/**
 * O template por tipo de casa — o que faz a Fase 0 terminar numa casa POVOADA
 * em vez de numa lista vazia com um botão "adicionar".
 *
 * Mora em código, e não numa tabela semeada por migration, por duas razões. A
 * primeira é que isto é conteúdo de produto: muda quando a gente aprende algo
 * sobre o onboarding, e uma migration por ajuste de texto é atrito que faz o
 * ajuste não acontecer. A segunda é a armadilha do `infra/README.md` — seed
 * dentro de migration roda como `casa_owner` e é rejeitado pelo `FORCE ROW
 * LEVEL SECURITY`, então teria que vir antes do FORCE, numa ordem que a
 * próxima pessoa a mexer não tem como adivinhar.
 *
 * Tamanho é decisão, não acaso: entre 6 e 8 itens. Menos parece casa vazia;
 * mais transforma a primeira tela numa lista de deveres — e a pessoa acabou de
 * chegar. O template é ponto de partida editável, não contrato.
 *
 * NÃO há atribuição de responsável aqui (manifesto §2): tarefa que já nasce com
 * dono transforma o primeiro minuto do app numa divisão que ninguém combinou.
 * Quem divide é o Épico 2, e são as pessoas.
 */
export const TEMPLATES: Record<TipoDeCasa, readonly string[]> = {
  casal: [
    'Louça do jantar',
    'Compras da semana',
    'Roupa: lavar e estender',
    'Banheiro',
    'Lixo e reciclagem',
    'Trocar a roupa de cama',
  ],
  republica: [
    'Louça do dia',
    'Cozinha: bancada e fogão',
    'Banheiro',
    'Lixo e reciclagem',
    'Áreas comuns: sala e corredor',
    'Compras do que é de todo mundo',
    'Contas do mês',
  ],
  familia: [
    'Louça do jantar',
    'Compras da semana',
    'Roupa: lavar, estender e guardar',
    'Banheiro',
    'Lixo e reciclagem',
    'Arrumar a cozinha depois do jantar',
    'Mochila e uniforme para amanhã',
  ],
}
