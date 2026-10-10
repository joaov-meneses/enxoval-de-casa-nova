#!/usr/bin/env bash
# Compara a contagem de linhas de cada tabela entre produção e staging. Só lê; não altera nada.
# Usa as mesmas variáveis do sync-prod-to-staging.sh: PROD_DATABASE_URL e STAGING_DATABASE_URL.
set -euo pipefail

if command -v psql >/dev/null; then
  psqlx() { psql "$@"; }
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  export MSYS_NO_PATHCONV=1
  psqlx() { docker run --rm postgres:18-alpine psql "$@"; }
else
  echo "Faltando psql. Instale o cliente do PostgreSQL 18 ou inicie o Docker Desktop."
  exit 1
fi

: "${PROD_DATABASE_URL:?Defina PROD_DATABASE_URL}"
: "${STAGING_DATABASE_URL:?Defina STAGING_DATABASE_URL}"

# Uma única conexão por banco: count(*) de todas as tabelas de public numa consulta só.
COUNT_SQL="select table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"

counts() {
  local url="$1" attempt
  for attempt in 1 2 3; do
    if psqlx "$url" -At -c "$COUNT_SQL"; then return 0; fi
    echo "Conexão falhou (tentativa $attempt/3), tentando de novo..." >&2
    sleep 3
  done
  return 1
}

prod="$(counts "$PROD_DATABASE_URL")"
staging="$(counts "$STAGING_DATABASE_URL")"

join -t= -a1 -a2 -e '-' -o 0,1.2,2.2 <(echo "$prod") <(echo "$staging") |
  awk -F= '{ printf "%-22s prod=%-7s staging=%-7s %s\n", $1, $2, $3, ($2==$3 ? "ok" : "DIFERENTE") }'
