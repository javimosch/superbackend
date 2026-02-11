# Coolify Headless Deploy (SaaSBackend)

The `manage.js` script in the root of the SaaSBackend repository is a specialized deployment tool. It facilitates an opinionated deployment workflow using SSH and rsync, specifically designed for remote servers running Traefik (common in Coolify or standalone Docker environments).

## Key Features

- **File Synchronization**: Uses `rsync` for efficient code transfer.
- **Remote Execution**: Executes Docker Compose commands via SSH.
- **Traefik Configuration**: Generates and deploys dynamic YAML routing configurations.
- **Headless Operation**: Designed for CI/CD or direct CLI usage without complex pipelines.

## Required Environment Variables

To use the script, ensure your `.env` file contains the following variables:

```bash
REMOTE_HOST_USER=root
REMOTE_HOST=188.245.71.48
REMOTE_HOST_PORT=22
REMOTE_HOST_PATH=/apps/superlandings
REMOTE_DOMAIN_HOST=188.245.71.48
REMOTE_SERVICE_IP=http://superlandings:3000
APP_NAME=superlandings
REMOTE_SYNC_EXCLUDES=data
REMOTE_DOMAIN_CONFIG_FILENAME=superlandings.yml
```

### Variable Breakdown

- **REMOTE_HOST**: The public IP of your remote server.
- **REMOTE_HOST_USER**: The SSH user (usually `root` or `ubuntu`).
- **REMOTE_HOST_PATH**: The directory where the app will live on the remote server.
- **REMOTE_SERVICE_IP**: The internal URL that Traefik should route to (usually the container name and port).
- **REMOTE_SYNC_EXCLUDES**: Folders or files to skip during rsync (e.g., `data`, `node_modules`).

## Commands

### 1. Provisioning
The script is available as `manage.js` in the repository root. You can also "provision" it (confirm its existence) via the SaaSBackend Admin UI.

### 2. Deploy Application
```bash
node manage.js deploy
```
Syncs files and restarts the Docker containers on the remote host.

### 3. Generate Traefik Proxy
```bash
node manage.js proxy
```
Creates the local Traefik YAML configuration based on your environment.

### 4. Deploy Traefik Config
```bash
node manage.js domain
```
Uploads the generated Traefik config to the gateway server.

## Dependencies

- **Local**: `node`, `ssh`, `rsync`.
- **Remote**: `docker`, `docker-compose` (or `docker compose`), `ssh-server`.
