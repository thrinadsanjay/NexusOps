#!/bin/sh
set -eu
DATA="${DHCP_DATA_DIR:-/var/lib/nexusops-dhcp}"
mkdir -p "$DATA"
CONF="$DATA/dnsmasq.conf"
FLAG="$DATA/enabled"
LEASES="$DATA/dnsmasq.leases"
touch "$LEASES"

echo "NexusOps DHCP sidecar watching $DATA"

while true; do
  if [ -f "$FLAG" ] && [ -s "$CONF" ]; then
    echo "Starting dnsmasq"
    dnsmasq -k --conf-file="$CONF" --dhcp-leasefile="$LEASES" --log-facility=- --keep-in-foreground &
    pid=$!
    while [ -f "$FLAG" ] && kill -0 "$pid" 2>/dev/null; do
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping dnsmasq"
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  else
    sleep 2
  fi
done
