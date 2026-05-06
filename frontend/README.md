# Frontend Service

React/Vite frontend for the Event Management System.

## Local development

```bash
npm install
npm run dev
```

The Vite development server proxies same-origin `/api/...` requests to the backend services configured in `vite.config.js`.

## Production container

The Docker image is a multi-stage build:

1. `node:20-alpine` builds the static Vite assets.
2. `nginx:1.27-alpine` serves the compiled files and proxies `/api/...` requests to the backend services.

Runtime API targets are configured with:

```text
USER_SERVICE_URL
EVENT_SERVICE_URL
REGISTRATION_SERVICE_URL
NOTIFICATION_SERVICE_URL
```

Docker Compose and Kubernetes set these to the internal service names, for example `http://event-service:3002`.
