import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getErrorMessage, serviceBaseUrls } from "./api";
import "./App.css";

const emptyRegisterForm = {
  name: "",
  email: "",
  password: "",
  role: "user",
};

const emptyLoginForm = {
  email: "sasa@example.com",
  password: "123456",
};

const emptyFilters = {
  search: "",
  status: "",
  category: "",
  location: "",
};

const defaultBookingDraft = {
  paymentMethod: "card",
  amount: "",
};

const defaultNotificationDraft = {
  type: "test",
  userId: "",
  eventId: "",
  paymentStatus: "success",
  message: "",
};

const navItems = [
  { id: "events", label: "Browse Events" },
  { id: "bookings", label: "My Bookings" },
  { id: "notifications", label: "Alerts" },
  { id: "account", label: "Account" },
  { id: "manage", label: "Host Event", organizerOnly: true },
];

const eventStatuses = ["upcoming", "cancelled", "completed"];
const notificationTypes = [
  { value: "test", label: "General" },
  { value: "event-update", label: "Event update" },
  { value: "reminder", label: "Reminder" },
  { value: "payment", label: "Payment" },
];

function getDefaultEventForm(userId = "") {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return {
    title: "",
    description: "",
    date: tomorrow,
    startTime: "10:00",
    endTime: "12:00",
    location: "",
    capacity: "30",
    category: "General",
    organizerId: userId ? String(userId) : "",
    status: "upcoming",
  };
}

function readStoredSession() {
  try {
    const user = window.localStorage.getItem("event-dashboard-user");

    return {
      user: normalizeUser(user ? JSON.parse(user) : null),
    };
  } catch {
    return { user: null };
  }
}

function normalizeRole(role) {
  return role === "organizer" ? "organizer" : "user";
}

function normalizeUser(user) {
  return user ? { ...user, role: normalizeRole(user.role) } : null;
}

function normalizeEvents(response) {
  if (Array.isArray(response)) {
    return response;
  }

  return response?.events || [];
}

function formatDate(value) {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function toNumberOrUndefined(value) {
  if (value === "" || value == null) {
    return undefined;
  }

  return Number(value);
}

function toOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function buildEventPayload(form, includeStatus = false) {
  const payload = {
    title: form.title.trim(),
    description: form.description.trim(),
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    location: form.location.trim(),
    capacity: Number(form.capacity),
    category: form.category.trim() || "General",
    organizerId: toNumberOrUndefined(form.organizerId),
  };

  if (includeStatus) {
    payload.status = form.status;
  }

  return payload;
}

function isEventFormValid(form) {
  return (
    form.title.trim() &&
    form.description.trim() &&
    form.date &&
    form.startTime &&
    form.endTime &&
    form.location.trim() &&
    Number(form.capacity) > 0
  );
}

function statusClass(status) {
  return `status-pill status-${status || "neutral"}`;
}

function Field({ id, label, children, hint }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function StatusPill({ value }) {
  return <span className={statusClass(value)}>{value || "unknown"}</span>;
}

function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

function AccessDenied() {
  return (
    <section className="panel access-denied">
      <span>Organizer only</span>
      <h2>Access denied</h2>
      <p>This area is restricted to organizers.</p>
    </section>
  );
}

function ServiceCard({ service }) {
  return (
    <article className={`service-card ${service.ok ? "online" : "offline"}`}>
      <div>
        <span className="service-dot" aria-hidden="true" />
        <h3>{service.name}</h3>
      </div>
      <strong>{service.ok ? "Online" : "Attention"}</strong>
      <p>{service.detail}</p>
      <small>{service.baseUrl}</small>
    </article>
  );
}

function App() {
  const storedSession = useMemo(() => readStoredSession(), []);
  const [activeView, setActiveView] = useState("events");
  const [currentUser, setCurrentUser] = useState(storedSession.user);
  const [notice, setNotice] = useState(null);

  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [lookupId, setLookupId] = useState("");
  const [lookupResult, setLookupResult] = useState(null);

  const [events, setEvents] = useState([]);
  const [eventFilters, setEventFilters] = useState(emptyFilters);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventForm, setEventForm] = useState(() =>
    getDefaultEventForm(storedSession.user?.id),
  );
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventSaving, setEventSaving] = useState(false);

  const [registrations, setRegistrations] = useState([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [bookingDraft, setBookingDraft] = useState(defaultBookingDraft);

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationDraft, setNotificationDraft] = useState(() => ({
    ...defaultNotificationDraft,
    userId: storedSession.user?.id ? String(storedSession.user.id) : "",
  }),
  );

  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [participantsEventId, setParticipantsEventId] = useState("");
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const currentUserId = currentUser?.id;
  const currentUserRole = currentUser?.role;
  const isOrganizer = currentUserRole === "organizer";
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !item.organizerOnly || isOrganizer),
    [isOrganizer],
  );

  const eventById = useMemo(
    () => new Map(events.map((event) => [Number(event.id), event])),
    [events],
  );

  const categories = useMemo(
    () => uniqueSorted(events.map((event) => event.category)),
    [events],
  );

  const summary = useMemo(() => {
    const capacity = events.reduce(
      (total, event) => total + Number(event.capacity || 0),
      0,
    );
    const booked = events.reduce(
      (total, event) => total + Number(event.bookedSeats || 0),
      0,
    );
    const unread = notifications.filter(
      (notification) => notification.status === "unread",
    ).length;

    return {
      totalEvents: events.length,
      upcomingEvents: events.filter((event) => event.status === "upcoming")
        .length,
      booked,
      capacity,
      registrations: registrations.length,
      unread,
    };
  }, [events, notifications, registrations]);

  const nextEvent = useMemo(
    () =>
      events
        .filter((event) => event.status === "upcoming")
        .toSorted((first, second) => new Date(first.date) - new Date(second.date))[0],
    [events],
  );

  const setSuccess = useCallback((message) => {
    setNotice({ type: "success", message });
  }, []);

  const setError = useCallback((message) => {
    setNotice({ type: "error", message });
  }, []);

  const loadEvents = useCallback(
    async (filters = emptyFilters) => {
      await Promise.resolve();
      setEventsLoading(true);
      setEventsError("");

      try {
        const response = await api.events.list(filters);
        const nextEvents = normalizeEvents(response);
        setEvents(nextEvents);
        setSelectedEvent((previous) => {
          if (!previous) {
            return previous;
          }

          const refreshed = nextEvents.find(
            (event) => Number(event.id) === Number(previous.id),
          );

          return refreshed || previous;
        });
      } catch (error) {
        const message = getErrorMessage(error, "Failed to load events");
        setEventsError(message);
        setError(message);
      } finally {
        setEventsLoading(false);
      }
    },
    [setError],
  );

  const loadRegistrations = useCallback(
    async (userId) => {
      if (!userId) return;

      await Promise.resolve();
      setRegistrationsLoading(true);

      try {
        const response = await api.registrations.listByUser(userId);
        setRegistrations(Array.isArray(response) ? response : []);
      } catch (error) {
        setError(getErrorMessage(error, "Failed to load registrations"));
      } finally {
        setRegistrationsLoading(false);
      }
    },
    [setError],
  );

  const loadNotifications = useCallback(
    async (userId) => {
      if (!userId) return;

      await Promise.resolve();
      setNotificationsLoading(true);

      try {
        const response = await api.notifications.listByUser(userId);
        setNotifications(Array.isArray(response) ? response : []);
      } catch (error) {
        setError(getErrorMessage(error, "Failed to load notifications"));
      } finally {
        setNotificationsLoading(false);
      }
    },
    [setError],
  );

  const loadParticipants = useCallback(
    async (eventId) => {
      if (!eventId || !currentUserId || currentUserRole !== "organizer") {
        return;
      }

      await Promise.resolve();
      setParticipantsLoading(true);
      setParticipantsEventId(String(eventId));

      try {
        const response = await api.registrations.listByEvent(
          eventId,
          currentUserId,
        );
        setParticipants(Array.isArray(response.participants) ? response.participants : []);
      } catch (error) {
        setParticipants([]);
        setError(getErrorMessage(error, "Failed to load event participants"));
      } finally {
        setParticipantsLoading(false);
      }
    },
    [currentUserId, currentUserRole, setError],
  );

  const loadServiceHealth = useCallback(async () => {
    await Promise.resolve();
    setServicesLoading(true);

    const checks = [
      {
        name: "User Service",
        baseUrl: serviceBaseUrls.user,
        request: api.health.user,
        detail: (data) => `${data.service || "user-service"} ${data.status}`,
      },
      {
        name: "User Database",
        baseUrl: serviceBaseUrls.user,
        request: api.health.userDb,
        detail: (data) => `PostgreSQL ${data.database}`,
      },
      {
        name: "Event Service",
        baseUrl: serviceBaseUrls.event,
        request: api.health.event,
        detail: (data) => `${data.totalEvents ?? 0} events available`,
      },
      {
        name: "Registration Service",
        baseUrl: serviceBaseUrls.registration,
        request: api.health.registration,
        detail: (data) => `${data.totalRegistrations ?? 0} registrations`,
      },
      {
        name: "Notification Service",
        baseUrl: serviceBaseUrls.notification,
        request: api.health.notification,
        detail: (data) => String(data),
      },
      {
        name: "Notification Database",
        baseUrl: serviceBaseUrls.notification,
        request: api.health.notificationDb,
        detail: (data) => `PostgreSQL ${data.database}`,
      },
    ];

    const results = await Promise.all(
      checks.map(async (check) => {
        try {
          const data = await check.request();

          return {
            name: check.name,
            baseUrl: check.baseUrl,
            ok: true,
            detail: check.detail(data),
          };
        } catch (error) {
          return {
            name: check.name,
            baseUrl: check.baseUrl,
            ok: false,
            detail: getErrorMessage(error, "Service unavailable"),
          };
        }
      }),
    );

    setServices(results);
    setServicesLoading(false);
  }, []);



  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadEvents();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadEvents]);

  useEffect(() => {
    if (activeView === "system") {
      const timerId = window.setTimeout(() => {
        loadServiceHealth();
      }, 0);

      return () => window.clearTimeout(timerId);
    }

    return undefined;
  }, [activeView, loadServiceHealth]);

  useEffect(() => {
    if (currentUser?.id) {
      const timerId = window.setTimeout(() => {
        loadRegistrations(currentUser.id);
        loadNotifications(currentUser.id);
      }, 0);

      return () => window.clearTimeout(timerId);
    }

    return undefined;
  }, [currentUser?.id, loadNotifications, loadRegistrations]);

  useEffect(() => {
    if (currentUser) {
      window.localStorage.setItem(
        "event-dashboard-user",
        JSON.stringify(currentUser),
      );
    } else {
      window.localStorage.removeItem("event-dashboard-user");
    }
  }, [currentUser]);

  function syncEvent(updatedEvent) {
    setEvents((previous) =>
      previous.map((event) =>
        Number(event.id) === Number(updatedEvent.id) ? updatedEvent : event,
      ),
    );

    setSelectedEvent((previous) =>
      previous && Number(previous.id) === Number(updatedEvent.id)
        ? updatedEvent
        : previous,
    );
  }

  async function handleRegister(event) {
    event.preventDefault();

    if (
      !registerForm.name.trim() ||
      !registerForm.email.trim() ||
      registerForm.password.length < 6
    ) {
      setError("Name, email, and a 6 character password are required.");
      return;
    }

    try {
      const response = await api.users.register({
        name: registerForm.name.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
        role: registerForm.role,
      });
      const nextUser = normalizeUser(response.user);
      setCurrentUser(nextUser);
      setNotificationDraft((draft) => ({
        ...draft,
        userId: nextUser?.id ? String(nextUser.id) : draft.userId,
      }));
      setEventForm((form) => ({
        ...form,
        organizerId: nextUser?.id ? String(nextUser.id) : form.organizerId,
      }));
      setRegisterForm(emptyRegisterForm);
      setActiveView("events");
      setSuccess(response.message || "User registered successfully.");
    } catch (error) {
      setError(getErrorMessage(error, "Registration failed"));
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!loginForm.email.trim() || !loginForm.password) {
      setError("Email and password are required.");
      return;
    }

    try {
      const response = await api.users.login({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      const nextUser = normalizeUser(response.user);
      setCurrentUser(nextUser);
      setNotificationDraft((draft) => ({
        ...draft,
        userId: nextUser?.id ? String(nextUser.id) : draft.userId,
      }));
      setEventForm((form) => ({
        ...form,
        organizerId: nextUser?.id ? String(nextUser.id) : form.organizerId,
      }));
      setActiveView("events");
      setSuccess(response.message || "Login successful.");
    } catch (error) {
      setError(getErrorMessage(error, "Login failed"));
    }
  }

  async function handleLookupUser(event) {
    event.preventDefault();

    if (!Number(lookupId)) {
      setError("Enter a positive numeric user ID.");
      return;
    }

    try {
      const response = await api.users.getById(lookupId);
      setLookupResult(response);
      setSuccess(`Loaded ${response.name || response.email}.`);
    } catch (error) {
      setLookupResult(null);
      setError(getErrorMessage(error, "User lookup failed"));
    }
  }

  function logout() {
    setCurrentUser(null);
    setLookupResult(null);
    setRegistrations([]);
    setNotifications([]);
    setParticipants([]);
    setParticipantsEventId("");
    setActiveView("account");
    setSuccess("Signed out.");
  }

  async function openEventDetails(id) {
    try {
      const response = await api.events.getById(id);
      const event = response.event || response;
      setSelectedEvent(event);
      setActiveView("events");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to load event details"));
    }
  }

  function startEditingEvent(event) {
    if (!isOrganizer) {
      setError("Organizer access is required to edit events.");
      return;
    }

    setEditingEventId(event.id);
    setEventForm({
      title: event.title || "",
      description: event.description || "",
      date: event.date ? String(event.date).slice(0, 10) : "",
      startTime: event.startTime || "",
      endTime: event.endTime || "",
      location: event.location || "",
      capacity: String(event.capacity || ""),
      category: event.category || "General",
      organizerId: event.organizerId ? String(event.organizerId) : "",
      status: event.status || "upcoming",
    });
    setActiveView("manage");
  }

  function resetEventForm() {
    setEditingEventId(null);
    setEventForm(getDefaultEventForm(currentUser?.id));
  }

  async function handleEventSubmit(event) {
    event.preventDefault();

    if (!isOrganizer) {
      setError("Organizer access is required to save events.");
      return;
    }

    if (!isEventFormValid(eventForm)) {
      setError(
        "Title, description, date, time, location, and positive capacity are required.",
      );
      return;
    }

    setEventSaving(true);

    try {
      const payload = {
        ...buildEventPayload(eventForm, Boolean(editingEventId)),
        organizerId: currentUser.id,
      };
      const response = editingEventId
        ? await api.events.update(editingEventId, payload)
        : await api.events.create(payload);

      const nextEvent = response.event;

      if (editingEventId) {
        syncEvent(nextEvent);
      } else {
        setEvents((previous) => [nextEvent, ...previous]);
      }

      resetEventForm();
      setSuccess(response.message || "Event saved successfully.");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to save event"));
    } finally {
      setEventSaving(false);
    }
  }

  async function handleCancelEvent(eventId) {
    if (!isOrganizer) {
      setError("Organizer access is required to cancel events.");
      return;
    }

    try {
      const response = await api.events.cancel(eventId, currentUser.id);
      syncEvent(response.event);
      setSuccess(response.message || "Event cancelled.");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to cancel event"));
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!isOrganizer) {
      setError("Organizer access is required to delete events.");
      return;
    }

    try {
      const response = await api.events.remove(eventId, currentUser.id);
      setEvents((previous) =>
        previous.filter((event) => Number(event.id) !== Number(eventId)),
      );
      setSelectedEvent((previous) =>
        previous && Number(previous.id) === Number(eventId) ? null : previous,
      );
      setSuccess(response.message || "Event deleted.");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to delete event"));
    }
  }

  async function handleSeatAction(eventId, action) {
    if (!isOrganizer) {
      setError("Organizer access is required to update seat inventory.");
      return;
    }

    try {
      const response =
        action === "reserve"
          ? await api.events.reserveSeat(eventId, currentUser.id)
          : await api.events.releaseSeat(eventId, currentUser.id);
      syncEvent(response.event);
      setSuccess(response.message || "Seat inventory updated.");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to update seat inventory"));
    }
  }

  async function handleBookEvent(event) {
    if (!currentUser) {
      setError("Sign in before registering for an event.");
      setActiveView("account");
      return;
    }

    if (currentUser.role !== "user") {
      setError("Only user accounts can reserve tickets.");
      return;
    }

    if (event.status !== "upcoming") {
      setError("Only upcoming events can be booked.");
      return;
    }

    if (Number(event.availableSeats) <= 0) {
      setError("This event is fully booked — no tickets available.");
      return;
    }

    try {
      const registrationResponse = await api.registrations.create({
        userId: currentUser.id,
        eventId: event.id,
        paymentMethod: toOptionalString(bookingDraft.paymentMethod),
        amount: toNumberOrUndefined(bookingDraft.amount),
      });

      await loadEvents(eventFilters);
      await loadRegistrations(currentUser.id);
      setSuccess(registrationResponse.message || "Registration successful.");
    } catch (error) {
      setError(getErrorMessage(error, "Registration failed"));
    }
  }

  async function handleCancelRegistration(registration) {
    try {
      const response = await api.registrations.cancel(registration.id, {
        userId: currentUser.id,
      });

      setRegistrations((previous) =>
        previous.filter((item) => item.id !== registration.id),
      );
      await loadEvents(eventFilters);
      setSuccess(response.message || "Registration cancelled.");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to cancel registration"));
    }
  }

  async function handleNotificationSubmit(event) {
    event.preventDefault();

    if (!isOrganizer) {
      setError("Organizer access is required to create notifications.");
      return;
    }

    if (!Number(notificationDraft.userId)) {
      setError("Notification user ID is required.");
      return;
    }

    if (
      notificationDraft.type !== "test" &&
      !Number(notificationDraft.eventId)
    ) {
      setError("Event ID is required for this notification type.");
      return;
    }

    const basePayload = {
      organizerId: currentUser.id,
      userId: Number(notificationDraft.userId),
      eventId: toNumberOrUndefined(notificationDraft.eventId),
      message: toOptionalString(notificationDraft.message),
    };

    try {
      if (notificationDraft.type === "event-update") {
        await api.notifications.createEventUpdate(basePayload);
      } else if (notificationDraft.type === "reminder") {
        await api.notifications.createReminder(basePayload);
      } else if (notificationDraft.type === "payment") {
        await api.notifications.createPayment({
          ...basePayload,
          paymentStatus: notificationDraft.paymentStatus,
        });
      } else {
        await api.notifications.createTest({
          ...basePayload,
          type: "general",
        });
      }

      setNotificationDraft((draft) => ({
        ...draft,
        message: "",
      }));
      await loadNotifications(notificationDraft.userId);
      setSuccess("Notification created.");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to create notification"));
    }
  }

  async function markNotificationRead(notificationId) {
    try {
      const response = await api.notifications.markRead(
        notificationId,
        currentUser.id,
      );
      setNotifications((previous) =>
        previous.map((notification) =>
          notification.id === notificationId
            ? response.notification
            : notification,
        ),
      );
      setSuccess(response.message || "Notification marked as read.");
    } catch (error) {
      setError(getErrorMessage(error, "Failed to update notification"));
    }
  }

  function submitFilters(event) {
    event.preventDefault();
    loadEvents(eventFilters);
  }

  function clearFilters() {
    setEventFilters(emptyFilters);
    loadEvents(emptyFilters);
  }

  const selectedEventRegistered =
    selectedEvent &&
    registrations.some(
      (registration) =>
        Number(registration.eventId) === Number(selectedEvent.id),
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">EM</span>
          <div>
            <strong>EventHub</strong>
            <small>Find and book campus events</small>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          {visibleNavItems.map((item) => (
            <button
              className={activeView === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="session-card">
          <span>Signed in</span>
          {currentUser ? (
            <>
              <strong>{currentUser.name || currentUser.email}</strong>
              <small>User ID {currentUser.id}</small>
              <StatusPill value={currentUser.role} />
              <button className="text-button" onClick={logout} type="button">
                Sign out
              </button>
              <button
                className="text-button muted"
                onClick={() => setActiveView("system")}
                type="button"
              >
                System status
              </button>
            </>
          ) : (
            <>
              <strong>Guest</strong>
              <small>Login to book events.</small>
              <button
                className="text-button muted"
                onClick={() => setActiveView("system")}
                type="button"
              >
                System status
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="page-label">Event Management</span>
            <h1>
              {activeView === "events" && "Discover events"}
              {activeView === "manage" && "Manage events"}
              {activeView === "bookings" && "My bookings"}
              {activeView === "notifications" && "My alerts"}
              {activeView === "account" && "Account"}
              {activeView === "system" && "System status"}
            </h1>
          </div>

          <div className="topbar-actions">
            <button
              className="secondary-button"
              onClick={() => {
                loadEvents(eventFilters);
                if (activeView === "system") {
                  loadServiceHealth();
                }
              }}
              type="button"
            >
              Refresh
            </button>
            {isOrganizer ? (
              <button
                className="primary-button"
                onClick={() => setActiveView("manage")}
                type="button"
              >
                Host event
              </button>
            ) : null}
          </div>
        </header>

        {notice ? (
          <div className={`notice ${notice.type}`} role="status">
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)} type="button">
              Dismiss
            </button>
          </div>
        ) : null}

        {activeView === "system" ? (
          <section className="view-grid">
            <div className="stats-grid">
              <article className="stat-card">
                <span>Total events</span>
                <strong>{summary.totalEvents}</strong>
                <small>{summary.upcomingEvents} upcoming</small>
              </article>
              <article className="stat-card">
                <span>Booked seats</span>
                <strong>{summary.booked}</strong>
                <small>{summary.capacity} total capacity</small>
              </article>
              <article className="stat-card">
                <span>My registrations</span>
                <strong>{summary.registrations}</strong>
                <small>{currentUser ? "Current account" : "Login required"}</small>
              </article>
              <article className="stat-card">
                <span>Unread notifications</span>
                <strong>{summary.unread}</strong>
                <small>{currentUser ? "Current account" : "Login required"}</small>
              </article>
            </div>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>System health</h2>
                  <p>Development diagnostics for the API services behind the app.</p>
                </div>
                <button
                  className="secondary-button"
                  onClick={loadServiceHealth}
                  type="button"
                >
                  Check services
                </button>
              </div>

              {servicesLoading ? (
                <div className="loading-row">Checking services...</div>
              ) : (
                <div className="service-grid">
                  {services.map((service) => (
                    <ServiceCard key={service.name} service={service} />
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Monitoring</h2>
                  <p>Internal links for local development and troubleshooting.</p>
                </div>
              </div>
              <div className="link-grid">
                <a href="http://localhost:9090" rel="noreferrer" target="_blank">
                  Prometheus
                  <span>localhost:9090</span>
                </a>
                <a href="http://localhost:3005" rel="noreferrer" target="_blank">
                  Grafana
                  <span>localhost:3005</span>
                </a>
              </div>
            </section>
          </section>
        ) : null}

        {activeView === "events" ? (
          <section className="view-grid">
            <section className="hero-panel">
              <div className="hero-copy">
                <span>Upcoming events</span>
                <h2>Find your next event.</h2>
                <p>
                  Browse live sessions, check open seats, and manage your
                  bookings in one place.
                </p>
                <div className="hero-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      const filters = { ...emptyFilters, status: "upcoming" };
                      setEventFilters(filters);
                      loadEvents(filters);
                    }}
                    type="button"
                  >
                    Show upcoming
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setActiveView("bookings")}
                    type="button"
                  >
                    View my bookings
                  </button>
                </div>
              </div>
              <div className="hero-summary">
                <div>
                  <span>{summary.upcomingEvents}</span>
                  <small>Upcoming</small>
                </div>
                <div>
                  <span>{summary.capacity - summary.booked}</span>
                  <small>Open seats</small>
                </div>
                <div>
                  <span>{nextEvent ? formatDate(nextEvent.date) : "None"}</span>
                  <small>Next event</small>
                </div>
              </div>
            </section>

            <section className="panel">
              <form className="filters" onSubmit={submitFilters}>
                <Field id="search" label="Search">
                  <input
                    id="search"
                    onChange={(event) =>
                      setEventFilters({
                        ...eventFilters,
                        search: event.target.value,
                      })
                    }
                    placeholder="Title or description"
                    value={eventFilters.search}
                  />
                </Field>
                <Field id="status-filter" label="Status">
                  <select
                    id="status-filter"
                    onChange={(event) =>
                      setEventFilters({
                        ...eventFilters,
                        status: event.target.value,
                      })
                    }
                    value={eventFilters.status}
                  >
                    <option value="">All statuses</option>
                    {eventStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="category-filter" label="Category">
                  <select
                    id="category-filter"
                    onChange={(event) =>
                      setEventFilters({
                        ...eventFilters,
                        category: event.target.value,
                      })
                    }
                    value={eventFilters.category}
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="location-filter" label="Location">
                  <input
                    id="location-filter"
                    onChange={(event) =>
                      setEventFilters({
                        ...eventFilters,
                        location: event.target.value,
                      })
                    }
                    placeholder="Room, lab, hall"
                    value={eventFilters.location}
                  />
                </Field>
                <div className="filter-actions">
                  <button className="primary-button" type="submit">
                    Apply
                  </button>
                  <button
                    className="secondary-button"
                    onClick={clearFilters}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </form>
            </section>

            <div className="events-layout">
              <section className="event-list panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Events</h2>
                    <p>{events.length} events available</p>
                  </div>
                  {eventsLoading ? <span className="mini-loader">Loading</span> : null}
                </div>

                {eventsError ? <div className="inline-error">{eventsError}</div> : null}

                {events.length === 0 && !eventsLoading ? (
                  <EmptyState
                    title="No events found"
                    message="Create an event or adjust the filters."
                    action={
                      isOrganizer ? (
                      <button
                        className="primary-button"
                        onClick={() => setActiveView("manage")}
                        type="button"
                      >
                        Create event
                      </button>
                      ) : null
                    }
                  />
                ) : (
                  <div className="event-cards">
                    {events.map((event) => (
                      <article
                        className={
                          selectedEvent?.id === event.id
                            ? "event-card selected"
                            : "event-card"
                        }
                        key={event.id}
                      >
                        <div className="event-card-main">
                          <StatusPill value={event.status} />
                          <h3>{event.title}</h3>
                          <p>{event.description}</p>
                        </div>
                        <dl className="metadata-grid">
                          <div>
                            <dt>Date</dt>
                            <dd>{formatDate(event.date)}</dd>
                          </div>
                          <div>
                            <dt>Time</dt>
                            <dd>
                              {event.startTime} - {event.endTime}
                            </dd>
                          </div>
                          <div>
                            <dt>Location</dt>
                            <dd>{event.location}</dd>
                          </div>
                          <div>
                            <dt>Seats</dt>
                            <dd>
                              {event.availableSeats}/{event.capacity} open
                            </dd>
                          </div>
                        </dl>
                        <div className="seat-meter">
                          <span
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (Number(event.bookedSeats || 0) /
                                    Number(event.capacity || 1)) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="row-actions">
                          <button
                            className="primary-button"
                            onClick={() => openEventDetails(event.id)}
                            type="button"
                          >
                            Details
                          </button>
                          {isOrganizer ? (
                            <button
                              className="secondary-button"
                              onClick={() => startEditingEvent(event)}
                              type="button"
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <aside className="panel details-panel">
                {selectedEvent ? (
                  <>
                    <div className="panel-heading compact">
                      <div>
                        <h2>{selectedEvent.title}</h2>
                        <p>{selectedEvent.category || "General"}</p>
                      </div>
                      <StatusPill value={selectedEvent.status} />
                    </div>
                    <p className="detail-description">{selectedEvent.description}</p>
                    <dl className="details-list">
                      <div>
                        <dt>Date</dt>
                        <dd>{formatDate(selectedEvent.date)}</dd>
                      </div>
                      <div>
                        <dt>Time</dt>
                        <dd>
                          {selectedEvent.startTime} - {selectedEvent.endTime}
                        </dd>
                      </div>
                      <div>
                        <dt>Location</dt>
                        <dd>{selectedEvent.location}</dd>
                      </div>
                      <div>
                        <dt>Seat inventory</dt>
                        <dd>
                          {selectedEvent.bookedSeats} booked,{" "}
                          {selectedEvent.availableSeats} open
                        </dd>
                      </div>
                    </dl>

                    <div className="booking-box">
                      <h3>Book this event</h3>
                      <div className="form-grid two">
                        <Field id="payment-method" label="Payment method">
                          <select
                            id="payment-method"
                            onChange={(event) =>
                              setBookingDraft({
                                ...bookingDraft,
                                paymentMethod: event.target.value,
                              })
                            }
                            value={bookingDraft.paymentMethod}
                          >
                            <option value="">None</option>
                            <option value="card">card</option>
                            <option value="cash">cash</option>
                          </select>
                        </Field>
                        <Field id="payment-amount" label="Amount">
                          <input
                            id="payment-amount"
                            min="0"
                            onChange={(event) =>
                              setBookingDraft({
                                ...bookingDraft,
                                amount: event.target.value,
                              })
                            }
                            placeholder="Optional"
                            step="0.01"
                            type="number"
                            value={bookingDraft.amount}
                          />
                        </Field>
                      </div>
                      <button
                        className="primary-button wide"
                        disabled={
                          selectedEventRegistered ||
                          currentUser?.role === "organizer" ||
                          selectedEvent.status !== "upcoming" ||
                          Number(selectedEvent.availableSeats) <= 0
                        }
                        onClick={() => handleBookEvent(selectedEvent)}
                        type="button"
                      >
                        {currentUser?.role === "organizer"
                          ? "Organizer account"
                          : selectedEventRegistered
                          ? "Already registered"
                          : selectedEvent.status !== "upcoming"
                          ? "Event not available"
                          : Number(selectedEvent.availableSeats) <= 0
                          ? "Fully booked"
                          : "Register for event"}
                      </button>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="Select an event"
                    message="Open an event to view details and book a seat."
                  />
                )}
              </aside>
            </div>
          </section>
        ) : null}

        {activeView === "manage" ? (
          isOrganizer ? (
          <section className="view-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>{editingEventId ? "Edit event" : "Create event"}</h2>
                  <p>Create schedules with capacity and location details.</p>
                </div>
                {editingEventId ? (
                  <button
                    className="secondary-button"
                    onClick={resetEventForm}
                    type="button"
                  >
                    New instead
                  </button>
                ) : null}
              </div>

              <form className="form-grid" onSubmit={handleEventSubmit}>
                <Field id="event-title" label="Title">
                  <input
                    id="event-title"
                    onChange={(event) =>
                      setEventForm({ ...eventForm, title: event.target.value })
                    }
                    value={eventForm.title}
                  />
                </Field>
                <Field id="event-category" label="Category">
                  <input
                    id="event-category"
                    onChange={(event) =>
                      setEventForm({ ...eventForm, category: event.target.value })
                    }
                    value={eventForm.category}
                  />
                </Field>
                <Field id="event-description" label="Description">
                  <textarea
                    id="event-description"
                    onChange={(event) =>
                      setEventForm({
                        ...eventForm,
                        description: event.target.value,
                      })
                    }
                    rows="4"
                    value={eventForm.description}
                  />
                </Field>
                <Field id="event-location" label="Location">
                  <input
                    id="event-location"
                    onChange={(event) =>
                      setEventForm({ ...eventForm, location: event.target.value })
                    }
                    value={eventForm.location}
                  />
                </Field>
                <Field id="event-date" label="Date">
                  <input
                    id="event-date"
                    onChange={(event) =>
                      setEventForm({ ...eventForm, date: event.target.value })
                    }
                    type="date"
                    value={eventForm.date}
                  />
                </Field>
                <Field id="event-start" label="Start time">
                  <input
                    id="event-start"
                    onChange={(event) =>
                      setEventForm({ ...eventForm, startTime: event.target.value })
                    }
                    type="time"
                    value={eventForm.startTime}
                  />
                </Field>
                <Field id="event-end" label="End time">
                  <input
                    id="event-end"
                    onChange={(event) =>
                      setEventForm({ ...eventForm, endTime: event.target.value })
                    }
                    type="time"
                    value={eventForm.endTime}
                  />
                </Field>
                <Field id="event-capacity" label="Capacity">
                  <input
                    id="event-capacity"
                    min="1"
                    onChange={(event) =>
                      setEventForm({ ...eventForm, capacity: event.target.value })
                    }
                    type="number"
                    value={eventForm.capacity}
                  />
                </Field>
                <Field id="event-organizer" label="Organizer ID">
                  <input
                    id="event-organizer"
                    min="1"
                    onChange={(event) =>
                      setEventForm({
                        ...eventForm,
                        organizerId: event.target.value,
                      })
                    }
                    placeholder="Optional"
                    type="number"
                    value={eventForm.organizerId}
                  />
                </Field>
                {editingEventId ? (
                  <Field id="event-status" label="Status">
                    <select
                      id="event-status"
                      onChange={(event) =>
                        setEventForm({ ...eventForm, status: event.target.value })
                      }
                      value={eventForm.status}
                    >
                      {eventStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <div className="form-actions">
                  <button
                    className="primary-button"
                    disabled={eventSaving}
                    type="submit"
                  >
                    {eventSaving
                      ? "Saving..."
                      : editingEventId
                        ? "Update event"
                        : "Create event"}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Event management</h2>
                  <p>Edit, cancel, or delete scheduled events.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Seats</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.title}</strong>
                          <small>{event.location}</small>
                        </td>
                        <td>
                          <StatusPill value={event.status} />
                        </td>
                        <td>
                          {event.bookedSeats}/{event.capacity}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="secondary-button"
                              onClick={() => startEditingEvent(event)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="warning-button"
                              onClick={() => handleCancelEvent(event.id)}
                              type="button"
                            >
                              Cancel
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => handleSeatAction(event.id, "reserve")}
                              type="button"
                            >
                              Reserve seat
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => handleSeatAction(event.id, "release")}
                              type="button"
                            >
                              Release seat
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() => loadParticipants(event.id)}
                              type="button"
                            >
                              Participants
                            </button>
                            <button
                              className="danger-button"
                              onClick={() => handleDeleteEvent(event.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Participants</h2>
                  <p>
                    {participantsEventId
                      ? `Showing registrations for event ${participantsEventId}`
                      : "Select an event from the management table."}
                  </p>
                </div>
              </div>

              {participantsLoading ? (
                <div className="loading-row">Loading participants...</div>
              ) : participants.length === 0 ? (
                <EmptyState
                  title="No participants loaded"
                  message="Use the Participants action on an event to view registration and payment status."
                />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Registration</th>
                        <th>User</th>
                        <th>Payment</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((participant) => (
                        <tr key={participant.id}>
                          <td>
                            <strong>#{participant.id}</strong>
                            <small>{participant.status}</small>
                          </td>
                          <td>User {participant.userId}</td>
                          <td>
                            {participant.paymentStatus || "not set"}
                            <small>
                              {participant.paymentMethod || "no method"}{" "}
                              {participant.amount != null
                                ? `$${participant.amount}`
                                : ""}
                            </small>
                          </td>
                          <td>{formatDateTime(participant.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
          ) : (
            <AccessDenied />
          )
        ) : null}

        {activeView === "bookings" ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Registrations</h2>
                <p>Your confirmed registrations and payment details.</p>
              </div>
              <button
                className="secondary-button"
                disabled={!currentUser}
                onClick={() => loadRegistrations(currentUser?.id)}
                type="button"
              >
                Reload
              </button>
            </div>

            {!currentUser ? (
              <EmptyState
                title="Login required"
                message="Sign in to load registrations by user ID."
                action={
                  <button
                    className="primary-button"
                    onClick={() => setActiveView("account")}
                    type="button"
                  >
                    Go to account
                  </button>
                }
              />
            ) : registrationsLoading ? (
              <div className="loading-row">Loading registrations...</div>
            ) : registrations.length === 0 ? (
              <EmptyState
                title="No registrations"
                message="Register for an upcoming event from the Events page."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Registration</th>
                      <th>Event</th>
                      <th>Payment</th>
                      <th>Created</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((registration) => {
                      const event = eventById.get(Number(registration.eventId));

                      return (
                        <tr key={registration.id}>
                          <td>
                            <strong>#{registration.id}</strong>
                            <small>{registration.status}</small>
                          </td>
                          <td>
                            <strong>
                              {event?.title || `Event ${registration.eventId}`}
                            </strong>
                            <small>{event?.location || "Load events for details"}</small>
                          </td>
                          <td>
                            {registration.paymentStatus || "not set"}
                            <small>
                              {registration.paymentMethod || "no method"}{" "}
                              {registration.amount != null
                                ? `$${registration.amount}`
                                : ""}
                            </small>
                          </td>
                          <td>{formatDateTime(registration.createdAt)}</td>
                          <td>
                            <button
                              className="danger-button"
                              onClick={() => handleCancelRegistration(registration)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {activeView === "notifications" ? (
          <section className={isOrganizer ? "view-grid split" : "view-grid"}>
            {isOrganizer ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Create notification</h2>
                  <p>Create general, event, reminder, or payment notifications.</p>
                </div>
              </div>

              <form className="form-grid" onSubmit={handleNotificationSubmit}>
                <Field id="notification-type" label="Type">
                  <select
                    id="notification-type"
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        type: event.target.value,
                      })
                    }
                    value={notificationDraft.type}
                  >
                    {notificationTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="notification-user" label="User ID">
                  <input
                    id="notification-user"
                    min="1"
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        userId: event.target.value,
                      })
                    }
                    type="number"
                    value={notificationDraft.userId}
                  />
                </Field>
                <Field id="notification-event" label="Event ID">
                  <input
                    id="notification-event"
                    min="1"
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        eventId: event.target.value,
                      })
                    }
                    placeholder={
                      notificationDraft.type === "test" ? "Optional" : "Required"
                    }
                    type="number"
                    value={notificationDraft.eventId}
                  />
                </Field>
                {notificationDraft.type === "payment" ? (
                  <Field id="notification-payment" label="Payment status">
                    <select
                      id="notification-payment"
                      onChange={(event) =>
                        setNotificationDraft({
                          ...notificationDraft,
                          paymentStatus: event.target.value,
                        })
                      }
                      value={notificationDraft.paymentStatus}
                    >
                      <option value="success">success</option>
                      <option value="failed">failed</option>
                    </select>
                  </Field>
                ) : null}
                <Field id="notification-message" label="Message">
                  <textarea
                    id="notification-message"
                    onChange={(event) =>
                      setNotificationDraft({
                        ...notificationDraft,
                        message: event.target.value,
                      })
                    }
                    placeholder="Optional custom message"
                    rows="4"
                    value={notificationDraft.message}
                  />
                </Field>
                <div className="form-actions">
                  <button className="primary-button" type="submit">
                    Create notification
                  </button>
                  {isOrganizer ? (
                    <button
                      className="secondary-button"
                      onClick={() => loadNotifications(notificationDraft.userId)}
                      type="button"
                    >
                      Load user notifications
                    </button>
                  ) : null}
                </div>
              </form>
            </section>
            ) : null}

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>User notifications</h2>
                  <p>
                    {currentUser
                      ? `Showing user ${currentUser.id}`
                      : "Enter a user ID to load notifications."}
                  </p>
                </div>
              </div>

              {notificationsLoading ? (
                <div className="loading-row">Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <EmptyState
                  title="No notifications"
                  message={
                    isOrganizer
                      ? "Create a notification or load a different user."
                      : "You do not have any alerts yet."
                  }
                />
              ) : (
                <div className="notification-list">
                  {notifications.map((notification) => (
                    <article
                      className={`notification-item ${notification.status}`}
                      key={notification.id}
                    >
                      <div>
                        <StatusPill value={notification.status} />
                        <h3>{notification.type}</h3>
                        <p>{notification.message}</p>
                        <small>
                          Event {notification.eventId || "none"} ·{" "}
                          {formatDateTime(notification.createdAt)}
                        </small>
                      </div>
                      {notification.status === "unread" ? (
                        <button
                          className="secondary-button"
                          onClick={() => markNotificationRead(notification.id)}
                          type="button"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        ) : null}

        {activeView === "account" ? (
          <section className="view-grid split">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Login</h2>
                  <p>Use an existing seeded account or a newly registered profile.</p>
                </div>
              </div>
              <form className="form-grid" onSubmit={handleLogin}>
                <Field id="login-email" label="Email">
                  <input
                    id="login-email"
                    onChange={(event) =>
                      setLoginForm({ ...loginForm, email: event.target.value })
                    }
                    type="email"
                    value={loginForm.email}
                  />
                </Field>
                <Field id="login-password" label="Password">
                  <input
                    id="login-password"
                    onChange={(event) =>
                      setLoginForm({ ...loginForm, password: event.target.value })
                    }
                    type="password"
                    value={loginForm.password}
                  />
                </Field>
                <div className="form-actions">
                  <button className="primary-button" type="submit">
                    Login
                  </button>
                </div>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Register</h2>
                  <p>Create a new attendee profile.</p>
                </div>
              </div>
              <form className="form-grid" onSubmit={handleRegister}>
                <Field id="register-name" label="Name">
                  <input
                    id="register-name"
                    onChange={(event) =>
                      setRegisterForm({
                        ...registerForm,
                        name: event.target.value,
                      })
                    }
                    value={registerForm.name}
                  />
                </Field>
                <Field id="register-email" label="Email">
                  <input
                    id="register-email"
                    onChange={(event) =>
                      setRegisterForm({
                        ...registerForm,
                        email: event.target.value,
                      })
                    }
                    type="email"
                    value={registerForm.email}
                  />
                </Field>
                <Field id="register-password" label="Password">
                  <input
                    id="register-password"
                    onChange={(event) =>
                      setRegisterForm({
                        ...registerForm,
                        password: event.target.value,
                      })
                    }
                    type="password"
                    value={registerForm.password}
                  />
                </Field>
                <Field id="register-role" label="Role">
                  <select
                    id="register-role"
                    onChange={(event) =>
                      setRegisterForm({
                        ...registerForm,
                        role: event.target.value,
                      })
                    }
                    value={registerForm.role}
                  >
                    <option value="user">User</option>
                    <option value="organizer">Organizer</option>
                  </select>
                </Field>
                <div className="form-actions">
                  <button className="primary-button" type="submit">
                    Register
                  </button>
                </div>
              </form>
            </section>

            {isOrganizer ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>User lookup</h2>
                  <p>Check a user profile by numeric ID.</p>
                </div>
              </div>
              <form className="inline-form" onSubmit={handleLookupUser}>
                <input
                  min="1"
                  onChange={(event) => setLookupId(event.target.value)}
                  placeholder="User ID"
                  type="number"
                  value={lookupId}
                />
                <button className="secondary-button" type="submit">
                  Lookup
                </button>
              </form>
              {lookupResult ? (
                <div className="lookup-result">
                  <strong>{lookupResult.name}</strong>
                  <span>{lookupResult.email}</span>
                  <StatusPill value={lookupResult.role} />
                </div>
              ) : null}
            </section>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
