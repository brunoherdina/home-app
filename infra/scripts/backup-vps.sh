#!/usr/bin/env bash
# Backup diário do Postgres do Casa (Épico 0b). Cron do usuário `deploy` na VPS,
# meia hora depois do backup do improvisa (03:00):
#
#   30 3 * * * /opt/casa/infra/scripts/backup-vps.sh >> /backups/casa/backup.log 2>&1
#
# Destino: /backups/casa, 14 dias. SÓ NA VPS, por decisão (ADR-0014): perder a
# VPS é perder os dados de todas as casas. O restore se prova com
# infra/scripts/restore-teste.sh — backup sem restore testado não é backup.
#
# Formato custom do pg_dump (já comprimido, restaura com pg_restore). Sem pipe:
# o código de saída é o do próprio pg_dump, e um dump que falha no meio fica
# como .partial em vez de virar "backup" truncado — o que o improvisa aprendeu
# com o gzip num pipe sem pipefail.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . infra/.env; set +a

# O dump tem tudo: hash de senha, dados das casas. Só o dono lê.
umask 077
DESTINO="${CASA_BACKUP_DIR:-/backups/casa}"
mkdir -p "$DESTINO"
arquivo="$DESTINO/casa_$(date -u +%Y%m%d_%H%M%S).dump"

C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env"

$C exec -T -e PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD" postgres \
  pg_dump -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -Fc >"$arquivo.partial"
# Checagem barata (arquivo vazio ou lixo). A prova de verdade é o restore-teste.
$C exec -T postgres pg_restore --list >/dev/null <"$arquivo.partial"
mv "$arquivo.partial" "$arquivo"

find "$DESTINO" -name 'casa_*.dump' -mtime +14 -delete
find "$DESTINO" -name 'casa_*.dump.partial' -mtime +1 -delete
echo "$(date -u +%FT%TZ) backup ok: $arquivo ($(du -h "$arquivo" | cut -f1))"
