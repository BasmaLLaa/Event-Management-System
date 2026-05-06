const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3003;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3001";
const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL || "http://localhost:3002";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/event_management",
});

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

async function createRegistrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      event_id INT NOT NULL,
      status VARCHAR(50) DEFAULT 'confirmed',
      payment_status VARCHAR(50),
      payment_method VARCHAR(50),
      transaction_id VARCHAR(100),
      amount NUMERIC(10, 2),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, event_id)
    );
  `);
}

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM registrations");

    res.json({
      service: "Registration Service",
      status: "Running",
      port: PORT,
      database: "PostgreSQL connected",
      totalRegistrations: Number(result.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({
      message: "Health check failed",
      error: error.message,
    });
  }
});

app.post("/registrations", async (req, res) => {
  const { userId, eventId, paymentStatus, paymentMethod, transactionId, amount } =
    req.body;

  if (!userId || !eventId) {
    return res.status(400).json({
      message: "userId and eventId are required",
    });
  }

  try {
    await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
    await axios.get(`${EVENT_SERVICE_URL}/events/${eventId}`);

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
        Number(userId),
        Number(eventId),
        paymentStatus || null,
        paymentMethod || null,
        transactionId || null,
        amount === undefined ? null : Number(amount),
      ]
    );

    res.status(201).json({
      message: "Registration successful",
      registration: formatRegistration(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        message: "User already registered for this event",
      });
    }

    res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
});

app.get("/registrations/user/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

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
      message: "Failed to get registrations",
      error: error.message,
    });
  }
});

app.delete("/registrations/:id", async (req, res) => {
  const id = Number(req.params.id);

  try {
    const result = await pool.query(
      "DELETE FROM registrations WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Registration not found",
      });
    }

    res.json({
      message: "Registration cancelled successfully",
      registration: formatRegistration(result.rows[0]),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to cancel registration",
      error: error.message,
    });
  }
});

app.get("/metrics", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM registrations");

    res.type("text/plain");
    res.send(`registration_service_up 1
registration_total ${result.rows[0].count}
`);
  } catch (error) {
    res.status(500);
    res.type("text/plain");
    res.send(`registration_service_up 0
registration_service_error "${error.message}"
`);
  }
});

app.listen(PORT, async () => {
  await createRegistrationsTable();
  console.log(`Registration Service running on port ${PORT}`);
});
