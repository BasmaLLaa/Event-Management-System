# Kubernetes Setup

This folder runs the same app stack as `docker-compose.yml` with simple Kubernetes manifests.

## Services

- `database` - PostgreSQL 15 with a persistent volume and seeded `init.sql`
- `user-service` - user registration/login API
- `event-service` - event API
- `registration-service` - booking/registration API
- `notification-service` - notification API
- `frontend` - React/Vite frontend with API proxy routes
- `rabbitmq` - async messaging broker
- `prometheus` - metrics scraping
- `loki` - centralized log storage
- `promtail` - Kubernetes log collection
- `grafana` - dashboards UI

## Local Run With Minikube

Start Minikube:

```bash
minikube start --driver=qemu --network=socket_vmnet --container-runtime=docker
kubectl config use-context minikube
```

Point Docker commands at Minikube's Docker daemon:

```bash
eval $(minikube docker-env)
```

Build the local images first:

```bash
docker compose build
```

If the Kubernetes stack is already running and you rebuild an image with the same `latest` tag, restart the affected deployment:

```bash
kubectl -n event-management rollout restart deployment/frontend
```

Apply everything to Minikube:

```bash
kubectl apply -k k8s
```

Check the pods:

```bash
kubectl -n event-management get pods
kubectl -n event-management get services
```

Open the frontend:

```bash
kubectl -n event-management port-forward svc/frontend 3000:3000
```

Then visit:

```text
http://localhost:3000
```

Prometheus and Grafana can also be opened with port-forwarding:

```bash
kubectl -n event-management port-forward svc/prometheus 9090:9090
kubectl -n event-management port-forward svc/grafana 3005:3000
```

RabbitMQ management and Loki can also be opened with port-forwarding:

```bash
kubectl -n event-management port-forward svc/rabbitmq 15672:15672
kubectl -n event-management port-forward svc/loki 3100:3100
```

When you are done using Minikube's Docker daemon in this terminal, switch Docker back to the host daemon:

```bash
eval $(minikube docker-env -u)
```

## Notes

- The Kubernetes service names intentionally match Docker Compose names. The frontend uses full Kubernetes DNS names in `app-config` because Nginx resolves runtime proxy targets directly:
  - `http://user-service.event-management.svc.cluster.local:3001`
  - `http://event-service.event-management.svc.cluster.local:3002`
  - `http://registration-service.event-management.svc.cluster.local:3003`
  - `http://notification-service.event-management.svc.cluster.local:3004`
  - `postgresql://postgres:postgres@database:5432/event_management`
- The frontend browser calls `/api/...`; the frontend container proxies those requests to the internal Kubernetes services.
- `eval $(minikube docker-env)` makes `docker compose build` build app images directly inside Minikube, so Kubernetes can use them without pushing to Docker Hub.
- `registration-service` publishes successful booking messages to RabbitMQ queue `event_notifications`.
- `notification-service` consumes RabbitMQ booking messages and stores notifications.
- Promtail collects Kubernetes container logs and sends them to Loki. Grafana is provisioned with Prometheus and Loki data sources.

## Reset

To remove the Kubernetes stack:

```bash
kubectl delete -k k8s
```

If you also want to remove database data, delete the PVC:

```bash
kubectl -n event-management delete pvc postgres-data
```
