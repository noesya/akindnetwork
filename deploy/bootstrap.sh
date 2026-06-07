#!/usr/bin/env bash
#
# Kind — VPS bootstrap script.
#
# Run ONCE on a fresh Debian 13 VPS to prepare it for Kind. Idempotent: safe to
# re-run. Does NOT contain any secret. The actual application secrets live in
# /opt/kind/.env which you write manually after the first run (see README).
#
# Usage (from your laptop):
#   scp deploy/bootstrap.sh kind:/tmp/
#   ssh kind 'sudo bash /tmp/bootstrap.sh'
#
# What it does:
#   1. apt update + upgrade
#   2. install Docker CE + compose-plugin (official Docker apt repo)
#   3. add the `debian` user to the docker group
#   4. create /opt/kind and /var/www/kind/dist (owned by debian)
#   5. open firewall ports 80 + 443 (ufw)
#   6. harden SSH: disable root login + password auth (key auth only)
#
# Re-running this script is safe. It detects already-applied steps and skips.

set -euo pipefail

log() { echo -e "\033[36m▶\033[0m $*"; }

# ---------------------------------------------------------------------------
# 0. Sanity checks
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "Run me with sudo." >&2
  exit 1
fi
if ! grep -q 'trixie\|bookworm' /etc/os-release; then
  echo "Warning: this script is tested against Debian 12/13 only." >&2
fi

DEPLOY_USER="${DEPLOY_USER:-debian}"

# ---------------------------------------------------------------------------
# 1. System update
# ---------------------------------------------------------------------------
log "apt update + upgrade"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get -y -qq upgrade

# ---------------------------------------------------------------------------
# 2. Docker official repo
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker CE from the official repo"
  apt-get install -y -qq ca-certificates curl gnupg rsync ufw

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # shellcheck disable=SC1091
  source /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
else
  log "Docker already installed — skipping"
fi

# ---------------------------------------------------------------------------
# 3. Deploy user in the docker group
# ---------------------------------------------------------------------------
if id -nG "$DEPLOY_USER" | grep -qw docker; then
  log "$DEPLOY_USER already in docker group"
else
  log "adding $DEPLOY_USER to docker group"
  usermod -aG docker "$DEPLOY_USER"
fi

# ---------------------------------------------------------------------------
# 4. Filesystem layout
# ---------------------------------------------------------------------------
log "preparing /opt/kind and /var/www/kind"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0755 \
  /opt/kind /opt/kind/backend /var/www/kind /var/www/kind/dist

# ---------------------------------------------------------------------------
# 5. Firewall
# ---------------------------------------------------------------------------
if ! ufw status | grep -q "Status: active"; then
  log "enabling ufw (22, 80, 443)"
  ufw --force default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp comment 'ssh'
  ufw allow 80/tcp comment 'http'
  ufw allow 443/tcp comment 'https'
  ufw --force enable
else
  log "ufw already active"
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

# ---------------------------------------------------------------------------
# 6. SSH hardening
# ---------------------------------------------------------------------------
SSHD_DROPIN=/etc/ssh/sshd_config.d/99-kind.conf
if [[ ! -f "$SSHD_DROPIN" ]]; then
  log "hardening SSH (no root login, no password auth)"
  cat > "$SSHD_DROPIN" <<'EOF'
# Kind — hardening overrides. Managed by deploy/bootstrap.sh.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
  # Validate before restart so we don't lock ourselves out.
  sshd -t
  systemctl restart ssh
else
  log "SSH already hardened — skipping"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
log "bootstrap complete"
cat <<EOF

Next steps (on your laptop):
  1. Add a deploy key for GitHub Actions:
       - Generate locally:   ssh-keygen -t ed25519 -f ~/.ssh/kind-deploy -C 'gh-actions kind'
       - Copy public key:    ssh-copy-id -i ~/.ssh/kind-deploy.pub ${DEPLOY_USER}@<VPS>
       - Add private key as GH Actions secret  SSH_PRIVATE_KEY
       - Add VPS host as GH Actions variable    VPS_HOST  (IP or domain)
       - Add deploy user as GH Actions variable VPS_USER  (= ${DEPLOY_USER})
  2. Point DNS for akindnetwork.org and www.akindnetwork.org to this VPS.
  3. Write /opt/kind/.env on the VPS (cf. deploy/.env.example).
  4. git push origin main  → the deploy workflow does the rest.

EOF
