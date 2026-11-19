#!/bin/sh
set -e
key=/data/sshd/ssh_host_ed25519_key
if [ ! -f "$key" ]; then
  mkdir -p -m 700 /data/sshd
  ssh-keygen -q -t ed25519 -N '' -f "$key"
fi

# sshd gives sessions a minimal environment, so hand the container's proxy settings on to the agent's commands.
proxy_env=$(env | grep -E '^(HTTPS?|NO)_PROXY=' | tr '\n' ' ' || true)
set --
if [ -n "$proxy_env" ]; then
  # Node's fetch, which corepack downloads pnpm with, ignores the proxy otherwise; Node 22 warns on every start.
  set -- -o "SetEnv=$proxy_env NODE_USE_ENV_PROXY=1 NODE_OPTIONS=--disable-warning=UNDICI-EHPA"
fi

exec /usr/sbin/sshd -D -e -f /app/sshd_config "$@"
