const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
//const pool = require("./config/db");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3003;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3001";
const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL || "http://localhost:3002";

// Temporary storage until database integration
//let registrations = [];

function processPayment(paymentInfo) {
  if (!paymentInfo) {
    return {
      success: false,
      message: "Payment information is required",
    };
  }

  const { cardNumber, amount, paymentMethod } = paymentInfo;

  if (!cardNumber || amount === undefined || amount === null) {
    return {
      success: false,
      message: "cardNumber and amount are required",
    };
  }

  if (amount <= 0) {
    return {
      success: false,
      message: "Payment amount must be greater than 0",
    };
  }

  // failure condition for testing
  if (cardNumber === "0000") {
    return {
      success: false,
      paymentStatus: "failed",
      message: "Payment failed",
    };
  }

  return {
    success: true,
    paymentStatus: "paid",
    paymentMethod: paymentMethod || "card",
    transactionId: `TXN-${Date.now()}`,
    message: "Payment successful",
  };
}

// Health check
app.get("/", (req, res) => {
  res.json({
    service: "Registration Service",
    status: "Running",
    port: Number(PORT),
  });
});

// Create registration / book event with payment
app.post("/registrations", async (req, res) => {
  const { userId, eventId, paymentInfo } = req.body;

  if (!userId || !eventId) {
    return res.status(400).json({
      message: "userId and eventId are required",
    });
  }

  try {
   /* try {
           await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
     } catch (error) {
       return res.status(503).json({
       message: "User Service unavailable or user does not exist",
  });
}

      try {
             await axios.get(`${EVENT_SERVICE_URL}/events/${eventId}`);
       } catch (error) {
          return res.status(503).json({
           message: "Event Service unavailable or event does not exist",
  });
}*/
    // Prevent duplicate booking
   const existingRegistration = await pool.query(
        "SELECT * FROM registrations WHERE user_id = $1 AND event_id = $2",
        [userId, eventId]
   );

   if (existingRegistration.rows.length > 0) {
      return res.status(400).json({
      message: "User already registered for this event",
    });
}
    // Process payment before confirming registration
    const paymentResult = processPayment(paymentInfo);

    if (!paymentResult.success) {
      return res.status(400).json({
        message: "Registration failed because payment failed",
        payment: paymentResult,
      });
    }

    // Create registration only after successful payment
    const result = await pool.query(
  `INSERT INTO registrations 
   (user_id, event_id, status, payment_status, payment_method, transaction_id, amount)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING *`,
  [
    userId,
    eventId,
    "confirmed",
    paymentResult.paymentStatus,
    paymentResult.paymentMethod,
    paymentResult.transactionId,
    paymentInfo.amount,
  ]
);

const newRegistration = result.rows[0];

    return res.status(201).json({
      message: "Registration and payment successful",
      registration: newRegistration,
      payment: paymentResult,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
});

// Get all registrations
app.get("/registrations", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM registrations ORDER BY id");

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get registrations",
      error: error.message,
    });
  }
});

// Get all registrations for one user
app.get("/registrations/user/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  const result = await pool.query(
  "SELECT * FROM registrations WHERE user_id = $1",
  [userId]
);

res.json(result.rows);
});

// Get all registrations / participants for one event
app.get("/registrations/event/:eventId", async  (req, res) => {
  const eventId = Number(req.params.eventId);

  const result = await pool.query(
  "SELECT * FROM registrations WHERE event_id = $1",
  [eventId]
);

res.json({
  eventId,
  participantsCount: result.rows.length,
  participants: result.rows,
});
});

// Cancel registration
app.delete("/registrations/:id", async  (req, res) => {
  const id = Number(req.params.id);

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
  });
});

// Metrics endpoint for Prometheus bonus
app.get("/metrics", async (req, res) => {
  const totalResult = await pool.query(
    "SELECT COUNT(*) FROM registrations"
  );

  const paidResult = await pool.query(
    "SELECT COUNT(*) FROM registrations WHERE payment_status = 'paid'"
  );

  res.type("text/plain");
  res.send(`registration_service_up 1
registration_total ${totalResult.rows[0].count}
registration_paid_total ${paidResult.rows[0].count}
`);
});
// Temporary database test route
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
app.listen(PORT, () => {
  console.log(`Registration Service running on port ${PORT}`);
});
