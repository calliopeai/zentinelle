#!/bin/sh
set -eu

# The backend is the schema owner. Apply every routed database before serving
# requests so a new image cannot advertise healthy while its schema is stale.
# Worker/beat commands are intentionally left alone; the backend service owns
# this one-time deployment responsibility.
if [ "${1:-}" = "gunicorn" ]; then
    python manage.py migrate --database default --no-input
    python manage.py migrate --database zentinelle --no-input
    python manage.py migrate --database analytics --no-input
fi

exec "$@"
