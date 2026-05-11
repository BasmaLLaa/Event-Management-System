const express = require("express");
const cors = require("cors");
const axios = require("axios");
const amqp = require("amqplib");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL;
const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

if (
  !PORT ||
  !USER_SERVICE_URL ||
  !EVENT_SERVICE_URL ||
  !DATABASE_URL ||
  !RABBITMQ_URL ||
  !INTERNAL_SERVICE_TOKEN
) {
  console.error("Missing required environment variables:");
  console.error({
    PORT: Boolean(PORT),
    USER_SERVICE_URL: Boolean(USER_SERVICE_URL),
    EVENT_SERVICE_URL: Boolean(EVENT_SERVICE_URL),
    DATABASE_URL: Boolean(DATABASE_URL),
    RABBITMQ_URL: Boolean(RABBITMQ_URL),
    INTERNAL_SERVICE_TOKEN: Boolean(INTERNAL_SERVICE_TOKEN),
  });
  process.exit(1);
}

const RABBITMQ_RETRY_MS = Number(process.env.RABBITMQ_RETRY_MS || 5000);
const NOTIFICATION_QUEUE = "event_notifications";
let rabbitChannel = null;

const pool = new Pool({
  connectionString: DATABASE_URL,
});

function getInternalRequestConfig() {
  return {
    headers: {
      "x-internal-service-token": INTERNAL_SERVICE_TOKEN,
    },
  };
}

function getPositiveId(value, fieldName) {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    return {
      error: {
        message: `${fieldName} must be a valid positive number`,
      },
    };
  }

  return { id };
}

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await connection.createChannel();
    await rabbitChannel.assertQueue(NOTIFICATION_QUEUE, { durable: true });

    connection.on("close", () => {
      rabbitChannel = null;
      console.log("RabbitMQ connection closed. Reconnecting...");
      setTimeout(connectRabbitMQ, RABBITMQ_RETRY_MS);
    });

    console.log("Registration Service connected to RabbitMQ");
  } catch (error) {
    console.log("RabbitMQ not connected:", error.message);
    console.log(`Retrying RabbitMQ in ${RABBITMQ_RETRY_MS / 1000} seconds.`);
    setTimeout(connectRabbitMQ, RABBITMQ_RETRY_MS);
  }
}

function publishBookingNotification(registration) {
  if (!rabbitChannel) {
    console.log("RabbitMQ channel unavailable. Booking message not published.");
    return;
  }

  const message = {
    type: "booking.confirmed",
    userId: registration.userId,
    eventId: registration.eventId,
    registrationId: registration.id,
    message: `User ${registration.userId} booked event ${registration.eventId}`,
    createdAt: new Date().toISOString(),
  };

  rabbitChannel.sendToQueue(
    NOTIFICATION_QUEUE,
    Buffer.from(JSON.stringify(message)),
    { persistent: true }
  );

  console.log(`Published booking notification for registration ${registration.id}`);
}

// Convert Db column names into cleaner API response names
function formatRegistration(row) {
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    transactionId: row.transaction_id,
    amount: row.amount === null ? null : Number(row.amount),
    createdAt: row.created_at,
  };
}

// User sends only paymentMethod and amount.
// PaymentStatus and transactionId handled in the backend
function processPayment(paymentMethod, amount) {
  if (!paymentMethod) {
    return {
      success: false,
      message: "paymentMethod is required",
    };
  }

  if (amount === undefined || amount === null || Number(amount) <= 0) {
    return {
      success: false,
      message: "amount must be greater than 0",
    };
  }

  return {
    success: true,
    paymentStatus: "paid",
    paymentMethod,
    transactionId: `TXN-${Date.now()}`,
    amount: Number(amount),
  };
}

// Get user data from User Service
async function getUserById(userId) {
  const response = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);

  return response.data.user || response.data.data || response.data;
}

async function getEventById(eventId) {
  const response = await axios.get(`${EVENT_SERVICE_URL}/events/${eventId}`);

  // event-service wraps the event in { event: ... }
  return response.data.event || response.data.data || response.data;
}

// Extract role from user object
function getUserRole(user) {
  return user?.role === "organizer" ? "organizer" : "user";
}

function isOrganizerForEvent(user, event) {
  return (
    getUserRole(user) === "organizer" &&
    Number(user.id) === Number(event.organizerId)
  );
}

async function reserveSeat(eventId) {
  const response = await axios.patch(
    `${EVENT_SERVICE_URL}/events/${eventId}/reserve-seat`,
    {},
    getInternalRequestConfig()
  );

  return response.data.event || response.data.data || response.data;
}

async function releaseSeat(eventId) {
  const response = await axios.patch(
    `${EVENT_SERVICE_URL}/events/${eventId}/release-seat`,
    {},
    getInternalRequestConfig()
  );

  return response.data.event || response.data.data || response.data;
}

// Health check
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM registrations");

    res.json({
      service: "Registration Service",
      status: "Running",
      port: Number(PORT),
      database: "PostgreSQL connected",
      totalRegistrations: Number(result.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({
      service: "Registration Service",
      status: "Running",
      database: "PostgreSQL disconnected",
      error: error.message,
    });
  }
});

// Db connection test
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "Database connection successful",
      time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      message: "Database connection failed",
      error: error.message,
    });
  }
});

// Create registration / book event
// Only users with role = "user" can reserve tickets
app.post("/registrations", async (req, res) => {
  const { userId, eventId, paymentMethod, amount } = req.body;

  if (!userId || !eventId) {
    return res.status(400).json({
      message: "userId and eventId are required",
    });
  }

  const { id: userIdNumber, error: userIdError } = getPositiveId(
    userId,
    "userId"
  );
  const { id: eventIdNumber, error: eventIdError } = getPositiveId(
    eventId,
    "eventId"
  );

  if (userIdError) {
    return res.status(400).json(userIdError);
  }

  if (eventIdError) {
    return res.status(400).json(eventIdError);
  }

  let seatReserved = false;

  try {
    const existingRegistration = await pool.query(
      "SELECT id FROM registrations WHERE user_id = $1 AND event_id = $2",
      [userIdNumber, eventIdNumber]
    );

    if (existingRegistration.rows.length > 0) {
      return res.status(409).json({
        message: "User already registered for this event",
      });
    }

    // Check if user exists and has role "user"
    let user;

    try {
      user = await getUserById(userIdNumber);
    } catch (error) {
      return res.status(503).json({
        message: "User Service unavailable or user does not exist",
        service: "user-service",
        error: error.message,
      });
    }

    const userRole = getUserRole(user);

    if (userRole !== "user") {
      return res.status(403).json({
        message: "Only users can reserve tickets",
        role: userRole || "unknown",
      });
    }

    // Check if event exists and is bookable
    let event;

    try {
      event = await getEventById(eventIdNumber);
    } catch (error) {
      return res.status(503).json({
        message: "Event Service unavailable or event does not exist",
        service: "event-service",
        error: error.message,
      });
    }

    // Prevent booking cancelled or completed events
    if (event.status && event.status !== "upcoming") {
      return res.status(400).json({
        message: `Cannot book a ${event.status} event`,
        eventStatus: event.status,
      });
    }

    // Check available seats before attempting reserve
    if (Number(event.availableSeats) <= 0) {
      return res.status(400).json({
        message: "Event is fully booked — no tickets available",
        availableSeats: 0,
      });
    }

    // Process payment before saving registration
    const paymentResult = processPayment(paymentMethod, amount);

    if (!paymentResult.success) {
      return res.status(400).json({
        message: "Registration failed because payment failed",
        payment: paymentResult,
      });
    }

    try {
      await reserveSeat(eventIdNumber);
      seatReserved = true;
    } catch (error) {
      const status = error.response?.status || 503;

      return res.status(status).json({
        message:
          error.response?.data?.message ||
          "Event Service unavailable or event has no available seats",
        service: "event-service",
        error: error.message,
      });
    }

    // Save registration in Db
    const result = await pool.query(
      `
      INSERT INTO registrations
      (
        user_id,
        event_id,
        status,
        payment_status,
        payment_method,
        transaction_id,
        amount
      )
      VALUES ($1, $2, 'confirmed', $3, $4, $5, $6)
      RETURNING *
      `,
      [
        userIdNumber,
        eventIdNumber,
        paymentResult.paymentStatus,
        paymentResult.paymentMethod,
        paymentResult.transactionId,
        paymentResult.amount,
      ]
    );

    const registration = formatRegistration(result.rows[0]);

    publishBookingNotification(registration);

    res.status(201).json({
      message: "Registration successful",
      registration,
      payment: {
        paymentStatus: paymentResult.paymentStatus,
        paymentMethod: paymentResult.paymentMethod,
        transactionId: paymentResult.transactionId,
        amount: paymentResult.amount,
      },
    });
  } catch (error) {
    if (seatReserved) {
      try {
        await releaseSeat(eventIdNumber);
      } catch (releaseError) {
        console.error(`Failed to release reserved seat after registration error: ${releaseError.message}`);
      }
    }

    // PostgreSQL duplicate error from UNIQUE(user_id, event_id)
    if (error.code === "23505") {
      return res.status(409).json({
        message: "User already registered for this event",
      });
    }

    res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
});

// Get all registrations
app.get("/registrations", async (req, res) => {
  const { id: organizerId, error } = getPositiveId(
    req.query.organizerId,
    "organizerId"
  );

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const organizer = await getUserById(organizerId);

    if (getUserRole(organizer) !== "organizer") {
      return res.status(403).json({
        message: "Only organizers can view all registrations",
        role: getUserRole(organizer),
      });
    }

    const result = await pool.query(
      `
      SELECT * FROM registrations
      ORDER BY created_at DESC
      `
    );

    res.json(result.rows.map(formatRegistration));
  } catch (error) {
    res.status(500).json({
      message: "Failed to get registrations",
      error: error.message,
    });
  }
});

// Get registrations for one user
app.get("/registrations/user/:userId", async (req, res) => {
  const { id: userId, error } = getPositiveId(req.params.userId, "userId");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const result = await pool.query(
      `
      SELECT * FROM registrations
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json(result.rows.map(formatRegistration));
  } catch (error) {
    res.status(500).json({
      message: "Failed to get user registrations",
      error: error.message,
    });
  }
});

// Get participants / registrations for one event
// Only users with role = "organizer" can access participant list.
app.get("/registrations/event/:eventId", async (req, res) => {
  const { id: eventId, error: eventIdError } = getPositiveId(
    req.params.eventId,
    "eventId"
  );
  const { id: organizerId, error: organizerIdError } = getPositiveId(
    req.query.organizerId,
    "organizerId"
  );

  if (eventIdError) {
    return res.status(400).json(eventIdError);
  }

  if (organizerIdError) {
    return res.status(400).json(organizerIdError);
  }

  try {
    // Check organizer role using User Service
    let organizer;

    try {
      organizer = await getUserById(organizerId);
    } catch (error) {
      return res.status(503).json({
        message: "User Service unavailable or organizer does not exist",
        service: "user-service",
        error: error.message,
      });
    }

    const organizerRole = getUserRole(organizer);

    if (organizerRole !== "organizer") {
      return res.status(403).json({
        message: "Only event organizers can view event participants",
        role: organizerRole || "unknown",
      });
    }

    const event = await getEventById(eventId);

    if (!isOrganizerForEvent(organizer, event)) {
      return res.status(403).json({
        message: "Organizers can only view participants for their own events",
      });
    }

    const result = await pool.query(
      `
      SELECT * FROM registrations
      WHERE event_id = $1
      ORDER BY created_at DESC
      `,
      [eventId]
    );

    res.json({
      eventId,
      organizerId,
      participantsCount: result.rows.length,
      participants: result.rows.map(formatRegistration),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get event participants",
      error: error.message,
    });
  }
});

// Cancel registration
app.delete("/registrations/:id", async (req, res) => {
  const { id, error } = getPositiveId(req.params.id, "registration id");

  if (error) {
    return res.status(400).json(error);
  }

  try {
    const existing = await pool.query(
      "SELECT * FROM registrations WHERE id = $1",
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        message: "Registration not found",
      });
    }

    const registration = existing.rows[0];
    const requesterUserId = req.body.userId || req.query.userId;
    const requesterOrganizerId = req.body.organizerId || req.query.organizerId;
    let allowed = Number(requesterUserId) === Number(registration.user_id);

    if (!allowed && requesterOrganizerId) {
      const organizer = await getUserById(requesterOrganizerId);
      const event = await getEventById(registration.event_id);
      allowed = isOrganizerForEvent(organizer, event);
    }

    if (!allowed) {
      return res.status(403).json({
        message: "Users can cancel their own registration; organizers can manage registrations for their own events",
      });
    }

    const result = await pool.query(
      "DELETE FROM registrations WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Registration not found",
      });
    }

    let seatReleaseWarning = null;

    try {
      await releaseSeat(registration.event_id);
    } catch (releaseError) {
      seatReleaseWarning = releaseError.response?.data?.message || releaseError.message;
      console.error(`Failed to release seat after cancellation: ${seatReleaseWarning}`);
    }

    res.json({
      message: "Registration cancelled successfully",
      registration: formatRegistration(result.rows[0]),
      seatReleaseWarning,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to cancel registration",
      error: error.message,
    });
  }
});

// Metrics endpoint for Prometheus
app.get("/metrics", async (req, res) => {
  try {
    const totalResult = await pool.query("SELECT COUNT(*) FROM registrations");

    const paidResult = await pool.query(
      "SELECT COUNT(*) FROM registrations WHERE payment_status = 'paid'"
    );

    res.type("text/plain");
    res.send(`registration_service_up 1
registration_total ${totalResult.rows[0].count}
registration_paid_total ${paidResult.rows[0].count}
`);
  } catch (error) {
    res.status(500);
    res.type("text/plain");
    res.send(`registration_service_up 0
registration_service_error "${error.message}"
`);
  }
});

app.listen(PORT, () => {
  connectRabbitMQ();
  console.log(`Registration Service running on port ${PORT}`);
});
