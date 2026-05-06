FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine AS production

ENV PORT=3000
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
ENV USER_SERVICE_URL=http://user-service:3001
ENV EVENT_SERVICE_URL=http://event-service:3002
ENV REGISTRATION_SERVICE_URL=http://registration-service:3003
ENV NOTIFICATION_SERVICE_URL=http://notification-service:3004

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
