#!/bin/bash
# Teacher CLI. Talks to the game server's localhost-only admin endpoints.
PORT=${PORT:-80}
URL=http://127.0.0.1:$PORT/admin
case "$1" in
  status) curl -s "$URL/status" ;;
  bots)   curl -s "$URL/bots?n=${2:-10}" ;;
  nobots) curl -s "$URL/nobots" ;;
  reset)  curl -s "$URL/reset" ;;
  logs)   journalctl -u stainwars -f ;;
  restart) systemctl restart stainwars && echo restarted ;;
  update) curl -fsSL https://raw.githubusercontent.com/dwennersten-work/stain-wars/main/install.sh | bash ;;
  *) echo "usage: stainwars status | bots [N] | nobots | reset | logs | restart | update" ;;
esac
