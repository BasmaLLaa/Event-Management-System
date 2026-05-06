import axios from "axios";

const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

const apiRoot = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || "/api");

const buildBaseUrl = (envName, proxyPath) =>
  trimTrailingSlash(import.meta.env[envName] || `${apiRoot}${proxyPath}`);

export const serviceBaseUrls = {
  user: buildBaseUrl("VITE_USER_API_URL", "/user-service"),
  event: buildBaseUrl("VITE_EVENT_API_URL", "/event-service"),
  registration: buildBaseUrl(
    "VITE_REGISTRATION_API_URL",
    "/registration-service",
  ),
  notification: buildBaseUrl(
    "VITE_NOTIFICATION_API_URL",
    "/notification-service",
  ),
};

const client = axios.create({
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value != null),
  );
}

async function request(config) {
  const response = await client(config);
  return response.data;
}

export function getErrorMessage(error, fallback = "Request failed") {
  const data = error?.response?.data;

  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data?.message) {
    return data.message;
  }

  if (data?.error) {
    return data.error;
  }

  return error?.message || fallback;
}

export const api = {
  users: {
    register: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.user}/users/register`,
        data: payload,
      }),
    login: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.user}/users/login`,
        data: payload,
      }),
    getById: (id) =>
      request({
        method: "get",
        url: `${serviceBaseUrls.user}/users/${id}`,
      }),
  },
  events: {
    list: (filters) =>
      request({
        method: "get",
        url: `${serviceBaseUrls.event}/events`,
        params: cleanParams(filters),
      }),
    getById: (id) =>
      request({
        method: "get",
        url: `${serviceBaseUrls.event}/events/${id}`,
      }),
    create: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.event}/events`,
        data: payload,
      }),
    update: (id, payload) =>
      request({
        method: "put",
        url: `${serviceBaseUrls.event}/events/${id}`,
        data: payload,
      }),
    remove: (id) =>
      request({
        method: "delete",
        url: `${serviceBaseUrls.event}/events/${id}`,
      }),
    cancel: (id) =>
      request({
        method: "patch",
        url: `${serviceBaseUrls.event}/events/${id}/cancel`,
      }),
    reserveSeat: (id) =>
      request({
        method: "patch",
        url: `${serviceBaseUrls.event}/events/${id}/reserve-seat`,
      }),
    releaseSeat: (id) =>
      request({
        method: "patch",
        url: `${serviceBaseUrls.event}/events/${id}/release-seat`,
      }),
  },
  registrations: {
    create: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.registration}/registrations`,
        data: payload,
      }),
    listByUser: (userId) =>
      request({
        method: "get",
        url: `${serviceBaseUrls.registration}/registrations/user/${userId}`,
      }),
    cancel: (id) =>
      request({
        method: "delete",
        url: `${serviceBaseUrls.registration}/registrations/${id}`,
      }),
  },
  notifications: {
    listByUser: (userId) =>
      request({
        method: "get",
        url: `${serviceBaseUrls.notification}/notifications/user/${userId}`,
      }),
    markRead: (id) =>
      request({
        method: "put",
        url: `${serviceBaseUrls.notification}/notifications/${id}/read`,
      }),
    createTest: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.notification}/notifications/test`,
        data: payload,
      }),
    createEventUpdate: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.notification}/notifications/event-update`,
        data: payload,
      }),
    createReminder: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.notification}/notifications/reminder`,
        data: payload,
      }),
    createPayment: (payload) =>
      request({
        method: "post",
        url: `${serviceBaseUrls.notification}/notifications/payment`,
        data: payload,
      }),
  },
  health: {
    user: () =>
      request({
        method: "get",
        url: `${serviceBaseUrls.user}/health`,
      }),
    userDb: () =>
      request({
        method: "get",
        url: `${serviceBaseUrls.user}/health/db`,
      }),
    event: () =>
      request({
        method: "get",
        url: `${serviceBaseUrls.event}/`,
      }),
    registration: () =>
      request({
        method: "get",
        url: `${serviceBaseUrls.registration}/`,
      }),
    notification: () =>
      request({
        method: "get",
        url: `${serviceBaseUrls.notification}/health`,
      }),
    notificationDb: () =>
      request({
        method: "get",
        url: `${serviceBaseUrls.notification}/health/db`,
      }),
  },
};
