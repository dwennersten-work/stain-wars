#!/bin/bash
# Teacher CLI. Talks to the game server's localhost-only admin endpoints.
PORT=${PORT:-80}
URL=http://127.0.0.1:$PORT/admin
case "$1" in
  newgame) curl -s "$URL/newgame?ffa=${2:-15}&team=${3:-5}&boss=${4:-5}" ;;
  boss)   curl -s "$URL/boss?min=${2:-5}" ;;
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
  update)
    # Stay on the installed branch (a test server running a feature branch keeps getting that branch's updates).
    B=$(git -C /opt/stainwars rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
    [[ "$B" =~ ^[A-Za-z0-9._/-]+$ ]] || B=main
    curl -fsSL "https://raw.githubusercontent.com/dwennersten-work/stain-wars/$B/install.sh" | BRANCH="$B" bash ;;
  student)
    # Give one student an SSH login that can only run game commands (no shell, no sudo). Run as root. See student_access.md.
    case "$2" in
      add)
        # Keep only "type key" so a pasted line can't sneak in authorized_keys options or extra lines.
        KEY=$(printf '%s' "$3" | head -n1 | awk '{print $1" "$2}')
        RE='^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)) [A-Za-z0-9+/]+=*$'
        [[ "$KEY" =~ $RE ]] || { echo "usage: stainwars student add 'ssh-ed25519 AAAA...'  (paste the student's .pub key in quotes)"; exit 1; }
        id student >/dev/null 2>&1 || useradd -m -s /bin/bash student   # no password: key login only
        usermod -aG systemd-journal student   # lets the "logs" menu command read the game log
        mkdir -p /home/student/.ssh
        # restrict = no port forwarding, file copy, etc.; pty = needed for htop; command = always the menu below, never a shell.
        echo "restrict,pty,command=\"/usr/local/bin/stainwars student-shell\" $KEY student" > /home/student/.ssh/authorized_keys
        # Root owns the whole home: even if the student found a way to write a file, they can't edit their key's limits or .bashrc.
        chown -R root:root /home/student && chmod 755 /home/student /home/student/.ssh && chmod 644 /home/student/.ssh/authorized_keys
        echo "Student can now run: ssh student@$("$0" url | sed 's#http://##; s#:.*##')" ;;
      remove)
        # userdel -r skips a home the user doesn't own, so remove it ourselves.
        pkill -u student 2>/dev/null; userdel student 2>/dev/null && rm -rf /home/student && echo "student removed" || echo "no student user" ;;
      *) echo "usage: stainwars student add 'ssh-ed25519 AAAA...' | student remove" ;;
    esac ;;
  student-shell)
    # Forced command for the student's key. Runs one command (ssh student@IP status) or a menu. Only allow-listed game commands.
    trap ':' INT   # Ctrl+C stops htop/logs but not the menu
    HELP="Commands: newgame [ffaMin] [teamMin] [bossMin] | boss [min] | skip | stop | status | url | bots [N] | nobots | reset | htop | logs | help | exit"
    run() {
      set -f; set -- $1; set +f
      [[ "$2$3$4" =~ ^[0-9.]*$ ]] || { echo "Numbers only after the command, like: newgame 15 5 5"; return; }
      case "$1" in
        newgame|boss|skip|stop|status|url|bots|nobots|reset) /usr/local/bin/stainwars "$1" "$2" "$3" "$4"; echo ;;
        htop) htop ;;
        logs) echo "(Ctrl+C to stop)"; journalctl -u stainwars -f -n 30 --no-pager ;;   # --no-pager: a pager could open a shell
        exit|quit) exit 0 ;;
        "") ;;
        *) echo "$HELP" ;;
      esac
    }
    if [ -n "$SSH_ORIGINAL_COMMAND" ]; then run "$SSH_ORIGINAL_COMMAND"; exit; fi
    echo "Stain Wars game controls. $HELP"
    while read -r -p "stainwars> " LINE; do run "$LINE"; done   # plain read (no -e): readline could launch an editor
    echo ;;
  *) echo "usage: stainwars newgame [ffaMin] [teamMin] [bossMin] | boss [min] | skip | stop | status | url | bots [N] | nobots | reset | logs | restart | update | student add '<key>' | student remove" ;;
esac
