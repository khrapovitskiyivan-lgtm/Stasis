# Deploy Stasis to Oracle Cloud (Always Free) — prototype runbook

Goal: the app running 24/7 on a free Oracle VM, reachable over HTTPS at a free
`*.duckdns.org` domain, so the Telegram Mini App opens for a focus group without a
tunnel and without your PC staying on.

**Scope note:** Oracle is NOT in Russia. Fine for a throwaway focus-group prototype
(legal formalities deferred). A real pilot with real personal data still needs RU
hosting — separate step.

Our Docker stack (`Dockerfile` + `docker-compose.yml` + `Caddyfile`) is vendor-neutral;
only VM provisioning, the Oracle firewall, and the domain differ from a normal deploy.

---

## Part 1 — Create the VM

1. Oracle Cloud console → **Compute → Instances → Create instance**.
2. **Image:** Canonical **Ubuntu 22.04**.
3. **Shape** (click "Change shape"):
   - Prefer **Ampere / VM.Standard.A1.Flex**, set **1 OCPU / 6 GB** (comfortable, ARM).
   - If you get "Out of host capacity" (common on Always Free ARM), fall back to
     **VM.Standard.E2.1.Micro** (x86, 1 OCPU / 1 GB) — works, but you MUST add swap
     (Part 3, step 1) or the Docker build will OOM.
   - Both are Always Free eligible (watch the "Always Free eligible" tag).
4. **SSH keys:** upload your public key (or let Oracle generate a pair and save the
   private key). You'll SSH as user **`ubuntu`**.
5. **Networking:** keep the default VCN/subnet, **assign a public IPv4** (default). Note
   the **public IP** after creation.
6. Create. Wait until "Running".

---

## Part 2 — Open ports 80 and 443 (the #1 Oracle gotcha — two firewalls)

Oracle blocks inbound traffic in **two** places. You must open **both**.

**(a) VCN Security List** (cloud-side):
- Instance details → **Virtual cloud network** → **Security Lists** → default list →
  **Add Ingress Rules**, twice:
  - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **80**.
  - Source `0.0.0.0/0`, IP Protocol **TCP**, Destination port **443**.

**(b) The VM's own iptables** (Oracle Ubuntu ships with everything-but-SSH blocked).
After you SSH in (Part 3), run:
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
(If `netfilter-persistent` is missing: `sudo apt-get install -y iptables-persistent` and
accept saving current rules.)

---

## Part 3 — SSH in, prep the box

```bash
ssh ubuntu@<PUBLIC_IP>
```

1. **Swap (REQUIRED on the 1 GB x86 micro; skip if you took the 6 GB ARM):**
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

2. **Install Docker + compose plugin:**
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker   # or log out/in so `docker` works without sudo
docker --version && docker compose version
```

3. **Open the firewall** (Part 2b commands) if you haven't yet.

---

## Part 4 — Free domain via DuckDNS (needed for HTTPS)

Caddy can't issue a cert for a bare IP, so get a free subdomain:

1. Go to **duckdns.org**, sign in (GitHub/Google), create a subdomain, e.g. `stasis-app`.
   You now own `stasis-app.duckdns.org`. Copy your DuckDNS **token**.
2. Point it at your VM's public IP (run on the VM, substitute your values):
```bash
curl "https://www.duckdns.org/update?domains=stasis-app&token=<DUCKDNS_TOKEN>&ip=<PUBLIC_IP>"
```
Expect `OK`. Verify it resolves: `nslookup stasis-app.duckdns.org` shows your IP.

Your domain is now `stasis-app.duckdns.org` (use YOUR subdomain everywhere below).

---

## Part 5 — Get the code and configure `.env`

```bash
git clone https://github.com/khrapovitskiyivan-lgtm/Stasis.git && cd Stasis
cp .env.example .env
mkdir -p data
```

Edit `.env` (`nano .env`). Fill exactly these — generate secrets with
`openssl rand -hex 32`:
```
BOT_TOKEN=<your @Stasis_new_bot token>
JWT_SECRET=<openssl rand -hex 32>
DATA_ENC_KEY=<openssl rand -hex 32>            # 64 hex chars
WEBHOOK_SECRET=<openssl rand -hex 32>
DOMAIN=stasis-app.duckdns.org                  # NO https://, YOUR subdomain
PUBLIC_BASE_URL=https://stasis-app.duckdns.org
MINIAPP_URL=https://stasis-app.duckdns.org
TG_SHARE_BASE_URL=https://t.me/Stasis_new_bot
REGION=ru
DATABASE_PATH=/app/data/stasis.sqlite
```
(REGION=ru only selects the RU crisis-line/copy — unrelated to server location.)

---

## Part 6 — Launch

```bash
DOMAIN=stasis-app.duckdns.org docker compose up -d --build
docker compose logs -f app        # wait for "stasis server on :3000" + "telegram webhook registered"
```
The first build takes a few minutes (Node image + install + Vite build + resvg + fonts).
Caddy will fetch a Let's Encrypt cert automatically over port 80 — this only works if
Part 2 (both firewalls) is done.

Verify HTTPS + the app:
```bash
curl https://stasis-app.duckdns.org/health     # → {"ok":true,"region":"ru",...}
```

---

## Part 7 — Point the bot at it, test

1. In **@BotFather** → your bot → **Bot Settings → Menu Button** (and/or `/setdomain`) →
   `https://stasis-app.duckdns.org`. (Not strictly required for the `/start` inline
   button, but needed for the menu button and share deep links.)
2. In Telegram: **`/start`** → open the Mini App → full flow.

**One-bot rule:** a bot can have only ONE active webhook. `docker compose up` registers
the webhook to your DuckDNS domain, which OVERWRITES the tunnel prototype's webhook. So
once Oracle is live, stop the local tunnel + server on your PC (they're now redundant).

---

## Part 8 — Day-to-day ops

- Logs: `docker compose logs -f app`
- Restart: `docker compose restart app`
- Stop / start: `docker compose down` / `docker compose up -d`
- **Deploy new code:** `git pull && DOMAIN=stasis-app.duckdns.org docker compose up -d --build`
  (data in `./data` persists across rebuilds).
- DuckDNS IP is static as long as you keep the VM; if the public IP ever changes, re-run
  the Part 4 update curl.

---

## Gotchas checklist

- [ ] BOTH firewalls open (VCN Security List **and** VM iptables) — else Caddy can't get a
      cert and nothing is reachable.
- [ ] Swap added if on the 1 GB micro — else the build OOM-kills.
- [ ] ARM shape → image builds natively as arm64 (node:24 + resvg have arm64 builds); no
      action needed, just don't mix architectures.
- [ ] DuckDNS resolves to the VM IP before `docker compose up` (Caddy needs it for the
      cert challenge).
- [ ] Stop the PC tunnel/server once Oracle is live (one webhook per bot).
- [ ] Oracle ARM "out of capacity" is common — retry later or take the x86 micro.

---

*This is a throwaway-prototype deploy. Real-pilot hosting (RU residency, lawyer-approved
legal docs, confirmed adult crisis line) remains the separate pre-launch checklist.*
