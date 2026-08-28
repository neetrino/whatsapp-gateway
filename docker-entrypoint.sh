#!/bin/sh
set -eu
mkdir -p /app/data
npx prisma migrate deploy
if [ -n "${CONTROL_PLANE_JSON:-}" ]; then
  printf '%s' "${CONTROL_PLANE_JSON}" > /app/data/import.json
  CONTROL_PLANE_IMPORT=/app/data/import.json node dist/scripts/import-control-plane.js
  rm -f /app/data/import.json
elif [ -n "${CONTROL_PLANE_IMPORT:-}" ] && [ -f "${CONTROL_PLANE_IMPORT}" ]; then
  node dist/scripts/import-control-plane.js
fi
exec node dist/main.js
