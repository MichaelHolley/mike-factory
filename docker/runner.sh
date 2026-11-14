#!/bin/sh
set -e
key=/data/sshd/ssh_host_ed25519_key
if [ ! -f "$key" ]; then
  mkdir -p -m 700 /data/sshd
  ssh-keygen -q -t ed25519 -N '' -f "$key"
fi
exec /usr/sbin/sshd -D -e -f /app/sshd_config
