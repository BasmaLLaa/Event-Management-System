# Event Management System Documentation

This document explains the project structure, services, container setup, local development workflow, Linux deployment steps, and Kubernetes deployment steps.

## Overview

The project is a Dockerized event management platform made of multiple services that communicate over Docker Compose networks or Kubernetes services.

The frontend is a React application served by Nginx in production. Backend services are Node.js APIs. PostgreSQL stores application data. Prometheus and Grafana provide basic monitoring.

## Project Structure

```text
Event-Management-System-integration/
  database/
    init.sql
  event-service/
    Dockerfile
    index.js
    config/db.js
  frontend/
    Dockerfile
    nginx.conf.template
    src/
    vite.config.js
  k8s/
    README.md
    namespace.yaml
    config.yaml
    postgres.yaml
    backend-services.yaml
    frontend.yaml
    monitoring.yaml
    kustomization.yaml
  monitoring/
    prometheus.yml
  notification-service/
    Dockerfile
    src/index.js
  registration-service/
    Dockerfile
    index.js
  user-service/
    Dockerfile
    src/app.js
    src/db.js
  docker-compose.yml
```

## Components

| Component | Type | Port | Purpose |
|---|---:|---:|---|
| `frontend` | React + Nginx | `3000` | User interface and API proxy |
| `user-service` | Node.js API | `3001` | User registration, login, user lookup |
| `event-service` | Node.js API | `3002` | Event listing, creation, updates, capacity management |
| `registration-service` | Node.js API | `3003` | Event registration and cancellation |
| `notification-service` | Node.js API | `3004` | User notifications |
| `database` | PostgreSQL | `5432` | Shared database |
| `prometheus` | Monitoring | `9090` | Metrics scraping |
| `grafana` | Monitoring UI | `3005` | Dashboards |

## Service Communication

### Docker Compose

Docker Compose creates a shared network called `event-network`. Containers communicate through service names.

Examples:

```text
frontend -> http://event-service:3002
registration-service -> http://user-service:3001
registration-service -> http://event-service:3002
backend services -> postgresql://postgres:postgres@database:5432/event_management
```

The browser does not call backend containers directly. It calls the frontend:

```text
Browser -> http://localhost:3000/api/event-service/events
```

The frontend Nginx container proxies that request internally:

```text
frontend -> http://event-service:3002/events
```

### Kubernetes

Kubernetes uses the namespace `event-management`.

Internal service URLs use Kubernetes DNS:

```text
http://user-service.event-management.svc.cluster.local:3001
http://event-service.event-management.svc.cluster.local:3002
http://registration-service.event-management.svc.cluster.local:3003
http://notification-service.event-management.svc.cluster.local:3004
postgresql://postgres:postgres@database:5432/event_management
```

The frontend still exposes same-origin browser paths:

```text
/api/user-service
/api/event-service
/api/registration-service
/api/notification-service
```

## Docker Images

The project uses more than three different images:

| Image | Used By |
|---|---|
| Custom Node.js image | Backend services |
| Custom Nginx frontend image | Frontend |
| `postgres:15` | Database |
| `prom/prometheus` | Prometheus |
| `grafana/grafana` | Grafana |

The frontend Dockerfile is optimized with a multi-stage build:

1. `node:20-alpine` builds static Vite assets.
2. `nginx:1.27-alpine` serves only the compiled production files and proxies API requests.

## Prerequisites

For local development:

```text
Docker
Docker Compose plugin
Node.js 20, only needed if running frontend directly outside Docker
```

For Kubernetes:

```text
kubectl
A Kubernetes cluster, such as Colima Kubernetes, Minikube, Kind, k3s, or a cloud cluster
```

For Linux deployment:

```text
Ubuntu or another Linux distribution
Docker
Docker Compose plugin
Git
```

## Local Development With Docker Compose

From the project root:

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

Open the frontend:

```text
http://localhost:3000
```

Useful URLs:

```text
Frontend:      http://localhost:3000
User API:      http://localhost:3001
Event API:     http://localhost:3002
Registration:  http://localhost:3003
Notifications: http://localhost:3004
Prometheus:    http://localhost:9090
Grafana:       http://localhost:3005
```

Stop the stack:

```bash
docker compose down
```

Stop the stack and remove database data:

```bash
docker compose down -v
```

## Frontend Development Outside Docker

This is optional. Docker Compose is the recommended full-stack workflow.

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server uses `frontend/vite.config.js` to proxy `/api/...` requests to backend services.

Run checks:

```bash
npm run lint
npm run build
```

## Deploying On Ubuntu Linux With Docker Compose

The final hosted project should run on Linux, not macOS or Windows.

Example Ubuntu setup:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
```

Install Docker using Docker's official convenience script:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and log back in so the Docker group change applies.

Clone the project:

```bash
git clone <your-repository-url>
cd Event-Management-System-integration
```

Start the platform:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

Open the frontend from another machine:

```text
http://<linux-server-ip>:3000
```

If the Linux server uses a firewall, allow the needed ports:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3005/tcp
sudo ufw allow 9090/tcp
```

For a public deployment, expose only the frontend port unless you intentionally need direct access to APIs or monitoring.

## Kubernetes Deployment

The Kubernetes manifests are in `k8s/`.

Build local images first:

```bash
docker compose build
```

Apply the Kubernetes stack:

```bash
kubectl apply -k k8s
```

Check pods and services:

```bash
kubectl -n event-management get pods
kubectl -n event-management get services
```

Wait for pods:

```bash
kubectl -n event-management get pods -w
```

Open the frontend with port-forwarding:

```bash
kubectl -n event-management port-forward svc/frontend 3000:3000
```

Then visit:

```text
http://localhost:3000
```

Open Prometheus:

```bash
kubectl -n event-management port-forward svc/prometheus 9090:9090
```

Open Grafana:

```bash
kubectl -n event-management port-forward svc/grafana 3005:3000
```

If you rebuild an image with the same `latest` tag, restart the related deployment:

```bash
kubectl -n event-management rollout restart deployment/frontend
kubectl -n event-management rollout status deployment/frontend
```

Delete the Kubernetes stack:

```bash
kubectl delete -k k8s
```

Delete Kubernetes database data:

```bash
kubectl -n event-management delete pvc postgres-data
```

## Colima Kubernetes Notes

On macOS, Colima can be used for local Kubernetes testing:

```bash
colima start --kubernetes
kubectl cluster-info
kubectl get nodes
```

This is only for development and testing. The final hosted project should run on Linux.

## API Health Checks

Useful checks through Docker Compose:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/user-service/health
curl http://localhost:3000/api/event-service/events
curl http://localhost:3000/api/notification-service/health
```

Useful Kubernetes checks after port-forwarding the frontend:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/event-service/events
```

## Troubleshooting

### Frontend shows 502 Bad Gateway

This means the frontend is running, but Nginx cannot reach a backend API.

Check Kubernetes pods:

```bash
kubectl -n event-management get pods
```

Check frontend logs:

```bash
kubectl -n event-management logs deployment/frontend
```

Check backend services:

```bash
kubectl -n event-management get services
```

Reapply config and restart frontend:

```bash
kubectl apply -k k8s
kubectl -n event-management rollout restart deployment/frontend
kubectl -n event-management rollout status deployment/frontend
```

### Browser cannot reach localhost:3000 in Kubernetes

Start port-forwarding and keep the terminal open:

```bash
kubectl -n event-management port-forward svc/frontend 3000:3000
```

If port `3000` is busy:

```bash
kubectl -n event-management port-forward svc/frontend 8080:3000
```

Then open:

```text
http://localhost:8080
```

### Database data needs reset

Docker Compose:

```bash
docker compose down -v
docker compose up -d --build
```

Kubernetes:

```bash
kubectl delete -k k8s
kubectl -n event-management delete pvc postgres-data
kubectl apply -k k8s
```

## Production Notes

For a stronger production deployment:

- Replace development secrets in `docker-compose.yml` and `k8s/config.yaml`.
- Keep database credentials in secrets, not plain text files.
- Expose only the frontend publicly.
- Put Nginx, an Ingress controller, or a cloud load balancer in front of the frontend.
- Use tagged images instead of `latest`.
- Push images to a registry if deploying Kubernetes on a remote Linux server.
- Use persistent storage that survives node restarts for PostgreSQL.

## Current Requirement Coverage

The project currently includes:

- Multiple communicating containers.
- Dockerized frontend, backend services, database, and monitoring.
- At least three different image types.
- Docker Compose local stack.
- Kubernetes manifests for orchestration.
- A production-style frontend image using Nginx.

The final project still needs to be hosted and demonstrated on a Linux machine to satisfy the Linux hosting requirement.
