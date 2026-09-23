#!/bin/sh
# Write a random ZENTINELLE_GATEWAY_TOKEN into the env file the backend and
# the gateway both read in compose (#380). Run once, before the first
# `docker compose up`; `make gateway-token` does it for .env.
#
# Idempotent: a token already in the file is never replaced, since changing it
# means restarting both services together. Without a token here, the backend
# mints one into the shared volume instead, so this step is optional.
#
# The value is 32 random bytes from openssl, never derived from names or other
# configuration, and it is never printed.
set -eu

env_file="${1:-.env}"
name=ZENTINELLE_GATEWAY_TOKEN

# A value counts as set when something other than quotes or whitespace follows
# the equals sign; the empty placeholder from .env.example does not.
if [ -f "$env_file" ] && grep -Eq "^${name}=[\"']?[^\"'[:space:]]" "$env_file"; then
    echo "$name is already set in $env_file; leaving it unchanged."
    exit 0
fi

token="$(openssl rand -hex 32)"
umask 077

if [ -f "$env_file" ] && grep -q "^${name}=" "$env_file"; then
    # Fill the empty placeholder in place, keeping the file's other lines and
    # its permissions.
    temporary="$(mktemp "${env_file}.XXXXXX")"
    awk -v line="${name}=${token}" -v prefix="${name}=" \
        'index($0, prefix) == 1 && !done { print line; done = 1; next } { print }' \
        "$env_file" > "$temporary"
    cat "$temporary" > "$env_file"
    rm -f "$temporary"
else
    # Start on a line of its own when the file does not end with a newline.
    if [ -s "$env_file" ] && [ -n "$(tail -c 1 "$env_file")" ]; then
        printf '\n' >> "$env_file"
    fi
    printf '%s=%s\n' "$name" "$token" >> "$env_file"
fi

echo "Wrote a new $name to $env_file (value not shown). Restart the backend and the gateway together if they are running."
