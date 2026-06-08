# Kind — deployment

Production target: a single VPS Lite Medium at Infomaniak (Debian 13, Docker), hosting the full stack:

```
Caddy (TLS, reverse proxy)
  ├── /var/www/kind/dist                    → frontend SPA
  └── api.akindnetwork.org → moleculer:3000 → backend
                                                ├── fuseki (Jena SPARQL + WebACL)
                                                └── redis (queues + rate-limit)
```

## One-time setup

### 1. SSH into the VPS

```bash
# add this to ~/.ssh/config on your laptop
Host kind
    HostName <VPS-IP>
    User debian
    IdentityFile ~/.ssh/<your-key>
    IdentitiesOnly yes
```

Test: `ssh kind 'whoami'` → should print `debian`.

### 2. Run the bootstrap via GitHub Actions

Once the SSH secret/vars below are configured (step 3), trigger the `setup-vps` workflow from the Actions tab. It runs `docker/bootstrap.sh` on the VPS without you opening an SSH terminal.

The bootstrap installs Docker, opens the firewall (22/80/443), hardens SSH (no root login, no password auth), and prepares `/opt/kind` + `/var/www/kind`. Idempotent — safe to re-run whenever you change the script.

### 3. Generate a deploy key for GitHub Actions

```bash
# on your laptop
ssh-keygen -t ed25519 -f ~/.ssh/kind-deploy -C 'gh-actions kind' -N ''
ssh-copy-id -i ~/.ssh/kind-deploy.pub kind   # adds the public key on the VPS
```

Then in the GitHub repo settings:

- **Secrets** (Settings → Secrets and variables → Actions → Secrets):
  - `SSH_PRIVATE_KEY` — contents of `~/.ssh/kind-deploy` (the private file)

- **Variables** (same page → Variables):
  - `VPS_HOST` — IP of the VPS (or a DNS name that resolves to it)
  - `VPS_USER` — `debian`
  - `VITE_FRONTEND_URL` — `https://akindnetwork.org`
  - `VITE_DEFAULT_POD_PROVIDER` — `https://armoise.co`

### 4. Point DNS

At your domain registrar, create these records pointing at the VPS IP:

| Name | Type | Value |
|---|---|---|
| `@` (akindnetwork.org) | A | `<VPS-IPv4>` |
| `www` | A | `<VPS-IPv4>` |
| `api` | A | `<VPS-IPv4>` |
| `@`, `www`, `api` | AAAA | `<VPS-IPv6>` |

TTL: 300 s while you're iterating, 3600 s once stable.

### 5. Write the backend `.env` on the VPS

```bash
ssh kind
cp /tmp/.env.example /opt/kind/.env   # or paste .env.example contents from the repo root
nano /opt/kind/.env                   # tweak values
exit
```

### 6. First deploy

Push to `main`. The `deploy` workflow runs automatically. Or trigger manually:

```bash
gh workflow run deploy.yml
```

Watch progress on the GitHub Actions tab.

## Subsequent deploys

Just `git push origin main`. The workflow rebuilds the frontend, rsyncs everything, and runs `docker compose up -d --build`. Caddy picks up the new files; Moleculer restarts.

## Updating the bootstrap script

The script is idempotent, so re-running it on the VPS is safe whenever you change it:

```bash
scp docker/bootstrap.sh kind:/tmp/
ssh kind 'sudo bash /tmp/bootstrap.sh'
```

## Inspecting prod

```bash
ssh kind
cd /opt/kind
docker compose ps          # service status
docker compose logs -f     # live logs (Ctrl-C to detach)
docker compose logs caddy  # one service
docker compose exec moleculer sh
```

## Rolling back

```bash
# on your laptop
git revert <bad-commit>
git push
```

The deploy workflow ships the previous version. No data loss — Fuseki + Redis + actor-keys volumes are persistent.

## Backups

Persistent data lives in four Docker named volumes: `fuseki-data`, `redis-data`, `caddy-data`, `actors-data`. To back them up:

```bash
ssh kind
sudo tar -C /var/lib/docker/volumes -czf /tmp/kind-volumes-$(date +%F).tgz fuseki-data redis-data caddy-data actors-data
# then rsync to local: rsync kind:/tmp/kind-volumes-*.tgz ~/backups/
```

A monthly cron of this command is enough for a project this size. We'll wire it up properly when needed.
