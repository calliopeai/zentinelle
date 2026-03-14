#!/bin/sh
# Force HOSTNAME to 0.0.0.0 for Next.js to listen on all interfaces
export HOSTNAME=0.0.0.0
exec node server.js
