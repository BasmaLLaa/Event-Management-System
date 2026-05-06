import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const port = Number(process.env.PORT || 3000);

const userServiceUrl =
  process.env.USER_SERVICE_URL || "http://localhost:3001";
const eventServiceUrl =
  process.env.EVENT_SERVICE_URL || "http://localhost:3002";
const registrationServiceUrl =
  process.env.REGISTRATION_SERVICE_URL || "http://localhost:3003";
const notificationServiceUrl =
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3004";

const proxyTarget = (target) => ({
  target,
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api\/[^/]+/, ""),
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port,
    proxy: {
      "/api/user-service": proxyTarget(userServiceUrl),
      "/api/event-service": proxyTarget(eventServiceUrl),
      "/api/registration-service": proxyTarget(registrationServiceUrl),
      "/api/notification-service": proxyTarget(notificationServiceUrl),
    },
  },
  preview: {
    host: "0.0.0.0",
    port,
  },
});
