# Running Stain Wars from your computer (student guide)

You're helping run the game on our cloud server. You'll type a few commands into a text window called a **terminal**. No experience needed: follow the steps for your computer and copy the commands exactly.

**How it works:** you make a digital "key" on your computer. It comes in two parts, like a lock and a key:
- The **public key** (file ending in `.pub`) is safe to share. You send it to your teacher, who puts it on the server.
- The **private key** (same name, no `.pub`) **never leaves your computer.** Never send, upload or paste it anywhere. It's your password.

You only do Steps 1 to 3 once, before game day.

---

## Step 1: Open a terminal

**Windows 10 / 11:** click Start, type `PowerShell`, and open **Windows PowerShell** (or **Terminal**). A window with a blinking cursor appears.

**Mac:** press **⌘ Command + Space**, type `Terminal`, press **Return**.

To run a command: type it (or paste it), then press **Enter** (Windows) or **Return** (Mac).
To paste: **Ctrl+V** on Windows (or right-click), **⌘ Command+V** on Mac.

## Step 2: Make your key

Type this and press Enter (same on Windows and Mac):
```
ssh-keygen -t ed25519
```
It asks three questions:
1. `Enter file in which to save the key` → just press **Enter**.
   - If it says `Overwrite (y/n)?`, you already have a key. Type `n`, press Enter, and skip to Step 3.
2. `Enter passphrase` → type a passphrase you'll remember, then Enter. **Nothing shows while you type. That's normal.** (You can leave it empty, but a passphrase protects you if someone else uses your computer.)
3. `Enter same passphrase again` → type it again, then Enter.

It prints some lines and a little picture made of symbols. Done.

## Step 3: Send your public key to your teacher

This copies your **public** key so you can paste it into an email or message.

**Windows:**
```
Get-Content $HOME\.ssh\id_ed25519.pub | Set-Clipboard
```

**Mac:**
```
pbcopy < ~/.ssh/id_ed25519.pub
```

Nothing seems to happen, but the key is now copied. Paste it into a message to your teacher. It's one long line that starts with `ssh-ed25519 AAAA`.

> ⚠️ Check it starts with `ssh-ed25519`. If it starts with `-----BEGIN`, that's your **private** key. Don't send it. Ask your teacher for help.

Your teacher will tell you when you've been added, and give you the server's **IP address** (four numbers with dots, like `164.90.12.34`).

---

## Step 4 (game day): Connect

Open a terminal (Step 1) and type the line below, using the IP address from your teacher instead of `164.90.12.34`:
```
ssh student@164.90.12.34
```
- **First time only:** it asks `Are you sure you want to continue connecting (yes/no/[fingerprint])?`. Type `yes` and press Enter.
- If you set a passphrase, type it (nothing shows) and press Enter.

You'll see:
```
Stain Wars game controls. Commands: newgame ...
stainwars>
```
You're in! Type commands after `stainwars>` and press Enter.

## Commands

| Type this | What it does |
|---|---|
| `status` | Game phase, time left, team scores, number of players and bots |
| `newgame` | Start a 25-minute game: 15 min free-for-all, a 5 min Owl Showdown (teams), then a 5 min Turkey Boss (everyone vs. a giant turkey) |
| `newgame 10 3 4` | Custom times: 10 min free-for-all + 3 min Owl Showdown + 4 min Turkey Boss (a `0` skips that part) |
| `boss 5` | Jump straight into a 5 min turkey boss fight. Wipes everyone's stuff like `newgame`. |
| `skip` | Jump to the next phase right now |
| `stop` | End the game, back to free play (everyone keeps their stuff) |
| `url` | Show the link players use to join |
| `bots 10` | Add 10 silly bots |
| `nobots` | Remove all bots |
| `reset` | ⚠️ Stops any game and wipes **everyone's** money and outfits. Ask first! |
| `htop` | Live view of the server's CPU and memory. Press `q` to go back. |
| `logs` | Watch the server's log as it happens. Press **Ctrl+C** to go back (Ctrl, not ⌘, on Mac too). |
| `help` | Show the command list |
| `exit` | Disconnect |

Only these commands work. That's on purpose: this login can run the game but can't change the server.

**Typical game day:** `status` → `newgame` → watch with `htop` or `status` → `skip` if a phase should end early → `exit` at the end.

## If something goes wrong

| You see | What to do |
|---|---|
| `Permission denied (publickey)` | Your key hasn't been added yet, or you're on a different computer. Tell your teacher. |
| `Connection timed out` or nothing happens | Check the IP address. If it's right, the school Wi-Fi may block it. Tell your teacher. |
| `ssh` is not recognized (Windows) | Your Windows is missing the SSH tool. Ask your teacher. |
| `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED` | The server was rebuilt. Tell your teacher before going on. |
| The screen is stuck | Press `q`, or **Ctrl+C**. Still stuck? Close the window and connect again. |

After the event the server is deleted, so this login stops working by itself.

---

## For the teacher
1. Paste the student's public key on the server, as root, keeping the quotes:
   `stainwars student add 'ssh-ed25519 AAAA...'`
   It prints the `ssh student@<IP>` line to give the student.
2. Before game day, have the student connect and run `status` to check that it works.
3. To take access away early, run `stainwars student remove`. Deleting the droplet removes it too.
4. Optional: in a DigitalOcean Cloud Firewall, allow port 22 only from the school's IP (keep port 80 open to everyone).

The login is limited on purpose: no shell, no `sudo`, no file copying, and no `restart` or `update`. See `decisions.md` → Security.
