#!/bin/bash
# Teacher CLI. Talks to the game server's localhost-only admin endpoints.
PORT=${PORT:-80}
URL=http://127.0.0.1:$PORT/admin
case "$1" in
  newgame) curl -s "$URL/newgame?ffa=${2:-15}&team=${3:-5}" ;;
  skip)   curl -s "$URL/skip" ;;
  stop)   curl -s "$URL/stop" ;;
  status) curl -s "$URL/status" ;;
  bots)   curl -s "$URL/bots?n=${2:-10}" ;;
  nobots) curl -s "$URL/nobots" ;;
  reset)  curl -s "$URL/reset" ;;
  url)
    # Public IP: DigitalOcean's metadata service first (no outside call), then a lookup service, then the local address.
    IP=$(curl -s -m 2 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address)
    [ -z "$IP" ] && IP=$(curl -s -m 3 https://ipv4.icanhazip.com)
    [ -z "$IP" ] && IP=$(hostname -I | awk '{print $1}')
    [ "$PORT" = 80 ] && echo "http://$IP" || echo "http://$IP:$PORT" ;;
  logs)   journalctl -u stainwars -f ;;
  restart) systemctl restart stainwars && echo restarted ;;
  update) curl -fsSL https://raw.githubusercontent.com/dwennersten-work/stain-wars/main/install.sh | bash ;;
  *) echo "usage: stainwars newgame [ffaMin] [teamMin] | skip | stop | status | url | bots [N] | nobots | reset | logs | restart | update" ;;
esac
