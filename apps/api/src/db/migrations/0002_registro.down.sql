-- Inverso de 0002_registro.sql.
--
-- REVOKE por coluna, e não `REVOKE INSERT ON TABLE`: revogar privilégio de
-- tabela NÃO desfaz grant de coluna no Postgres — o de tabela sairia sem
-- reclamar (nunca existiu) e o de coluna continuaria de pé. É a mesma armadilha
-- documentada em 0001, e a razão de `check-migration.sh` conferir com
-- `has_column_privilege`, que enxerga os dois níveis.
REVOKE INSERT ("apelido", "cor", "email", "hash_senha") ON "moradores" FROM casa_auth;
