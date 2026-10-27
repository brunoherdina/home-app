#!/usr/bin/env bash
# Deploy do Casa na VPS do improvisa-ai (ADR-0014). Roda em /opt/casa, depois que
# o workflow (ou alguém, à mão) fez `git merge --ff-only <sha>` do commit a subir:
#
#   bash infra/scripts/deploy-vps.sh
#
# 1. Build da imagem (api, worker e migrate são a mesma).
# 2. Migration SOZINHA, como casa_owner. Falhou → o script para aqui e a API
#    antiga continua no ar. Não dá para deixar isso com o `depends_on`: o `up`
#    recria api e worker antes de esperar a migration (medido em 2026-10-26).
# 3. Troca api e worker e espera o healthcheck.
# 4. Prova pela rede `edge`, pelo mesmo nome que o nginx do vps-edge usa.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -f infra/.env ]; then
  echo "::error::infra/.env ausente em $(pwd); ver infra/README.md, \"Produção\"" >&2
  exit 1
fi
if ! docker network inspect edge >/dev/null 2>&1; then
  echo "::error::rede docker 'edge' não existe; ela nasce no vps-edge" >&2
  exit 1
fi

C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env"

$C build
$C up -d --wait postgres
$C run --rm -T migrate </dev/null
$C up -d --no-deps --wait --wait-timeout 120 api worker

# De dentro da edge, com a própria imagem (tem wget do busybox). O role na
# resposta prova o contrato do ADR-0002 em produção, não só que a API respondeu.
saude=$(docker run --rm --network edge --entrypoint wget casa-api:prod -qO- -T 10 http://casa-api:3333/api/saude)
if ! grep -q '"role":"casa_app"' <<<"$saude"; then
  echo "::error::/api/saude pela edge não respondeu como casa_app: $saude" >&2
  exit 1
fi

docker image prune -f >/dev/null
# safe.directory: rodando como root (o repo é do `deploy`), o git recusa o repo.
echo "Deploy ok: $(git -c safe.directory="$PWD" rev-parse --short HEAD)"
