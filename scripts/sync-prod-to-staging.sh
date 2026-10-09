#!/usr/bin/env bash
# Copia os DADOS do Postgres de produção para o de staging (Railway), mantendo o schema do staging.
#
# - Produção é só lida (pg_dump). Nada é escrito nela.
# - O staging é esvaziado e recarregado dentro de UMA transação: se algo falhar, ele fica como estava.
# - Antes de mexer, faz um backup do staging em tmp/backups/.
# - As URLs vêm de variáveis de ambiente, nunca ficam no arquivo nem no histórico do git.
#
# Uso (Git Bash), pegando as URLs "DATABASE_PUBLIC_URL" do serviço Postgres de cada ambiente no Railway:
#   export PROD_DATABASE_URL='postgresql://...'      # ambiente production
#   export STAGING_DATABASE_URL='postgresql://...'   # ambiente staging
#   bash scripts/sync-prod-to-staging.sh
#
# Opcional: SKIP_SESSIONS=1 não copia as tabelas de sessão (tokens de login de produção).
set -euo pipefail

# Usa pg_dump/psql locais; se não houver, roda as do Postgres 18 via Docker (a versão precisa casar com o servidor).
if command -v pg_dump >/dev/null && command -v psql >/dev/null; then
  pgdump() { pg_dump "$@"; }
  psqlx() { psql "$@"; }
  psqlf() { psql "$@"; }
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  export MSYS_NO_PATHCONV=1
  IMG="postgres:18-alpine"
  docker image inspect "$IMG" >/dev/null 2>&1 || docker pull "$IMG"
  pgdump() { docker run --rm "$IMG" pg_dump "$@"; }
  psqlx() { docker run --rm "$IMG" psql "$@"; }          # sem -i: não consome o stdin de laços
  psqlf() { docker run --rm -i "$IMG" psql "$@"; }        # lê o SQL do stdin
else
  echo "Faltando pg_dump/psql. Instale o cliente do PostgreSQL 18 ou inicie o Docker Desktop."
  exit 1
fi

: "${PROD_DATABASE_URL:?Defina PROD_DATABASE_URL}"
: "${STAGING_DATABASE_URL:?Defina STAGING_DATABASE_URL}"

host_of() { echo "$1" | sed -E 's#^[a-z]+://[^@]*@([^/?]+).*#\1#'; }
PROD_HOST="$(host_of "$PROD_DATABASE_URL")"
STAGING_HOST="$(host_of "$STAGING_DATABASE_URL")"

if [ "$PROD_HOST" = "$STAGING_HOST" ]; then
  echo "ERRO: produção e staging apontam para o mesmo host ($PROD_HOST). Abortando."
  exit 1
fi

echo "Origem  (somente leitura): $PROD_HOST"
echo "Destino (SERÁ SOBRESCRITO): $STAGING_HOST"
read -r -p 'Digite "staging" para confirmar que o destino é o staging: ' answer
[ "$answer" = "staging" ] || { echo "Cancelado."; exit 1; }

mkdir -p tmp/backups
stamp="$(date +%Y%m%d-%H%M%S)"

echo "1/5 Backup do staging -> tmp/backups/staging-$stamp.dump"
pgdump --format=custom --no-owner "$STAGING_DATABASE_URL" > "tmp/backups/staging-$stamp.dump"

echo "2/5 Dump dos dados de produção (somente leitura)"
exclude=()
if [ "${SKIP_SESSIONS:-0}" = "1" ]; then
  exclude=(--exclude-table-data=public.sessions --exclude-table-data=public.admin_sessions)
fi
pgdump --data-only --no-owner --disable-triggers "${exclude[@]}" \
  "$PROD_DATABASE_URL" > "tmp/backups/prod-data-$stamp.sql"

echo "3/5 Montando a carga (TRUNCATE + dados) em uma transação"
tables="$(psqlx "$STAGING_DATABASE_URL" -At -c \
  "select string_agg(format('%I.%I', schemaname, tablename), ', ') from pg_tables where schemaname = 'public'")"
[ -n "$tables" ] || { echo "ERRO: o staging não tem tabelas em public. Suba o app para rodar as migrations antes."; exit 1; }
load="tmp/backups/load-$stamp.sql"
{
  echo "SET session_replication_role = replica;"
  echo "TRUNCATE TABLE $tables RESTART IDENTITY CASCADE;"
  cat "tmp/backups/prod-data-$stamp.sql"
  # Produção ainda pode não ter a coluna `status`: deriva do marcador antigo `checked`.
  echo "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='status') THEN UPDATE items SET status = 'bought' WHERE checked AND status = 'needed'; END IF; END \$\$;"
} > "$load"

echo "4/5 Carregando no staging"
psqlf "$STAGING_DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -q -f - < "$load"

echo "5/5 Conferindo contagem de linhas (produção x staging)"
# Se a conexão cair aqui, a carga já está feita: rode só scripts/compare-prod-staging-counts.sh.
bash "$(dirname "$0")/compare-prod-staging-counts.sh"

echo
echo "Pronto. Backups em tmp/backups/ (ignorado pelo git). ATENÇÃO: contêm dados reais de produção; apague quando não precisar mais."
