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
    messaging.yaml
    postgres.yaml
    backend-services.yaml
    frontend.yaml
    monitoring.yaml
    kustomization.yaml
  monitoring/
    prometheus.yml
    loki-config.yml
    promtail-compose.yml
    grafana/provisioning/datasources/datasources.yml
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
  docker-compose.dev.yml
  docker-compose.test.yml
  docker-compose.prod.yml
  .env.dev
  .env.test
  .env.prod
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
| `rabbitmq` | RabbitMQ | `5672`, `15672` | Async messaging and management UI |
| `prometheus` | Monitoring | `9090` | Metrics scraping |
| `loki` | Centralized logs | `3100` internal | Log storage |
| `promtail` | Log collector | internal | Collects container/Kubernetes logs and sends them to Loki |
| `grafana` | Monitoring UI | `3005` | Dashboards |

## Service Communication

### Docker Compose

Docker Compose creates a shared network called `event-network`. Containers communicate through service names.

Examples:

```text
frontend -> http://event-service:3002
registration-service -> http://user-service:3001
registration-service -> http://event-service:3002
registration-service -> amqp://rabbitmq:5672
notification-service -> amqp://rabbitmq:5672
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

## Roles And Access

Users have a `role` value in PostgreSQL. Supported roles are:

```text
user
organizer
```

New registrations default to `user` unless the registration form explicitly selects `organizer`. Missing or unknown roles are treated as `user`.

Users can browse events, reserve tickets through registration-service, pay using simulated payment, view their own registrations, cancel their own registrations, receive notifications, and mark their notifications as read.

Organizers can create events, update/cancel/delete their own events, manage schedules and seat inventory for their own events, view participants/payment status for their own events, and create event update/reminder notifications.

The seeded organizer account is:

```text
Seeded organizer email: beso.organizer@example.com
Seeded password: 123456
INITIAL_ORGANIZER_EMAIL=beso.organizer@example.com
```

`INITIAL_ORGANIZER_EMAIL` promotes an existing user with that email to `organizer` during user-service startup. There is no admin role.

The registration service updates event seat inventory through an internal service-to-service token:

```text
INTERNAL_SERVICE_TOKEN=event-management-dev-internal-secret
```

Change `INTERNAL_SERVICE_TOKEN` for real production deployments.

## Main API Endpoints

`user-service`:

- `POST /users/register`
- `POST /users/login`
- `GET /users/:id`
- `GET /users/:id/role`
- `GET /metrics`

`event-service`:

- `GET /events`
- `GET /events/:id`
- `POST /events` with organizer role check
- `PUT /events/:id` with organizer ownership check
- `DELETE /events/:id` with organizer ownership check
- `PATCH /events/:id/cancel` with organizer ownership check
- `PATCH /events/:id/reserve-seat` internal service or organizer owner
- `PATCH /events/:id/release-seat` internal service or organizer owner
- `GET /metrics`

`registration-service`:

- `POST /registrations` for user booking and simulated payment
- `GET /registrations?organizerId=ID` for organizer registration management
- `GET /registrations/user/:userId`
- `GET /registrations/event/:eventId?organizerId=ID`
- `DELETE /registrations/:id`
- `GET /metrics`

`notification-service`:

- `GET /notifications/user/:userId`
- `POST /notifications` with organizer role check
- `POST /notifications/event-update` with organizer role check
- `POST /notifications/reminder` with organizer role check
- `POST /notifications/payment` with organizer role check
- `PUT /notifications/:id/read`
- `GET /metrics`

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
| `rabbitmq:3-management-alpine` | Async messaging |
| `prom/prometheus` | Prometheus |
| `grafana/loki` | Central log storage |
| `grafana/promtail` | Log collection |
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
Minikube, or another Kubernetes cluster for remote deployment
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
RabbitMQ UI:   http://localhost:15672
Loki API:      http://localhost:3300
```

Stop the stack:

```bash
docker compose down
```

Stop the stack and remove database data:

```bash
docker compose down -v
```

## Multiple Docker Compose Environments

The project supports three Docker Compose environments:

- Development
- Testing
- Production

Each environment has its own env file, Compose override file, host ports, database name, Docker network, and Docker volume.

| Environment | Env File | Override File | Compose Project |
|---|---|---|---|
| Development | `.env.dev` | `docker-compose.dev.yml` | `event-dev` |
| Testing | `.env.test` | `docker-compose.test.yml` | `event-test` |
| Production | `.env.prod` | `docker-compose.prod.yml` | `event-prod` |

### Environment Ports

| Environment | Frontend | User API | Event API | Registration API | Notification API | PostgreSQL | Prometheus | Grafana | RabbitMQ UI | Loki |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Development | `3000` | `3001` | `3002` | `3003` | `3004` | `5432` | `9090` | `3005` | `15672` | `3300` |
| Testing | `3100` | `3101` | `3102` | `3103` | `3104` | `5433` | `9091` | `3105` | `15673` | `3310` |
| Production | `3200` | `3201` | `3202` | `3203` | `3204` | `5434` | `9092` | `3205` | `15674` | `3320` |

### Start One Environment

Development:

```bash
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Testing:

```bash
docker compose -p event-test --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml up -d --build
```

Production:

```bash
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Run All Environments At The Same Time

```bash
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose -p event-test --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml up -d --build
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Open each frontend:

```text
Development: http://localhost:3000
Testing:     http://localhost:3100
Production:  http://localhost:3200
```

Check each environment:

```bash
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml ps
docker compose -p event-test --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml ps
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
```

Stop each environment:

```bash
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down
docker compose -p event-test --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml down
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml down
```

Remove environment data as well:

```bash
docker compose -p event-dev --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -p event-test --env-file .env.test -f docker-compose.yml -f docker-compose.test.yml down -v
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml down -v
```

The `-p` value is important. It gives each environment separate container names, networks, and volumes.

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
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose -p event-prod --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
```

Open the frontend from another machine:

```text
http://<linux-server-ip>:3200
```

If the Linux server uses a firewall, allow the needed ports:

```bash
sudo ufw allow 3200/tcp
sudo ufw allow 3205/tcp
sudo ufw allow 9290/tcp
```

For a public deployment, expose only the frontend port unless you intentionally need direct access to APIs or monitoring.

## Kubernetes Deployment

The Kubernetes manifests are in `k8s/`.

### Local Kubernetes With Minikube

Install Minikube and its VM dependencies on macOS:

```bash
brew install minikube kubectl qemu socket_vmnet
HOMEBREW=$(which brew) && sudo ${HOMEBREW} services start socket_vmnet
```

Start Minikube:

```bash
minikube start --driver=qemu --network=socket_vmnet --container-runtime=docker
kubectl config use-context minikube
```

Point Docker commands at Minikube's Docker daemon:

```bash
eval $(minikube docker-env)
```

Build local images inside Minikube:

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

Open RabbitMQ management:

```bash
kubectl -n event-management port-forward svc/rabbitmq 15672:15672
```

Open Loki API:

```bash
kubectl -n event-management port-forward svc/loki 3100:3100
```

If you rebuild an image with the same `latest` tag, restart the related deployment:

```bash
docker compose build frontend
kubectl -n event-management rollout restart deployment/frontend
kubectl -n event-management rollout status deployment/frontend
```

When you are done building images for Minikube in this terminal, switch Docker back to the host daemon:

```bash
eval $(minikube docker-env -u)
```

Stop Minikube:

```bash
minikube stop
```

Delete the Kubernetes stack:

```bash
kubectl delete -k k8s
```

Delete Kubernetes database data:

```bash
kubectl -n event-management delete pvc postgres-data
```

## API Health Checks

Useful checks through Docker Compose:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/user-service/health
curl http://localhost:3000/api/event-service/events
curl http://localhost:3000/api/notification-service/health
```

RabbitMQ management login:

```text
Username: guest
Password: guest
```

Grafana includes provisioned data sources for:

```text
Prometheus
Loki
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
- Docker Compose development, testing, and production environment definitions.
- Separate ports, networks, and volumes so all Compose environments can run at the same time.
- Kubernetes manifests for orchestration.
- A production-style frontend image using Nginx.
- Prometheus and Grafana monitoring.
- Loki and Promtail centralized logging.
- RabbitMQ asynchronous booking messages from registration-service to notification-service through the `event_notifications` queue.

The final project still needs to be hosted and demonstrated on a Linux machine to satisfy the Linux hosting requirement.

## Final Submission Checklist

- Run the stack on Ubuntu/Linux.
- Start at least one Docker Compose environment and show containers communicating.
- Show development, testing, and production Compose configs with different ports.
- Build and run Kubernetes manifests.
- Demonstrate a `user` browsing, booking, paying, viewing registrations, and receiving notifications.
- Demonstrate an `organizer` creating/updating/cancelling events and viewing participants for their own events.
- Open Prometheus and Grafana.
- Show RabbitMQ booking messages creating notifications.
- Include screenshots or terminal output for Docker Compose, Kubernetes pods, frontend, Prometheus/Grafana, and RabbitMQ if your submission requires proof.
