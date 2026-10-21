#!/bin/bash
# Stain Wars installer for a fresh Ubuntu droplet. Run as root:
#   curl -fsSL https://raw.githubusercontent.com/dwennersten-work/stain-wars/main/install.sh | bash
# Re-running it updates to the latest version.
set -e
REPO=https://github.com/dwennersten-work/stain-wars.git
DIR=/opt/stainwars

echo "== Installing packages (node, git, htop) =="
apt-get update -y
apt-get install -y curl git htop ca-certificates
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "== Getting the game =="
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
cd "$DIR" && npm install --omit=dev

echo "== Setting up service =="
cat > /etc/systemd/system/stainwars.service <<EOF
[Unit]
Description=Stain Wars game server
After=network.target

[Service]
WorkingDirectory=$DIR
ExecStart=$(command -v node) server.js
Environment=PORT=80
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable stainwars
systemctl restart stainwars

chmod +x "$DIR/scripts/admin.sh"
ln -sf "$DIR/scripts/admin.sh" /usr/local/bin/stainwars
command -v ufw >/dev/null && ufw status | grep -q active && ufw allow 80/tcp || true

IP=$(curl -s https://ipv4.icanhazip.com || hostname -I | awk '{print $1}')
echo
echo "=============================================="
echo " Stain Wars is running!  Students go to:"
echo "   http://$IP"
echo
echo " Teacher commands:"
echo "   htop                 watch CPU / RAM live"
echo "   stainwars status     players, bots, projectiles"
echo "   stainwars bots 10    add 10 derpy bots"
echo "   stainwars nobots     remove all bots"
echo "   stainwars reset      reset everyone's outfits/money"
echo "   stainwars logs       follow server log"
echo "=============================================="
