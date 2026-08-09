#!/bin/sh
set -eu

[ "$(id -u)" -eq 0 ] || { echo 'Run as root on an Ubuntu GPU VPS.' >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo 'Only Ubuntu is supported by this provisioning script.' >&2; exit 1; }

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg git ufw
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /etc/apt/keyrings/nvidia-container-toolkit.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/etc/apt/keyrings/nvidia-container-toolkit.gpg] https://#' \
  > /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl enable --now docker
systemctl restart docker

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
echo 'GPU VPS is ready. Re-login after adding the deploy user to the docker group.'
