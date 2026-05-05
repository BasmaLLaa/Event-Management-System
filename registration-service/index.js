const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3003;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3001";
const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL || "http://localhost:3002";

let registrations = [];

app.get("/", (req, res) => {
  res.json({
    service: "Registration Service",
    status: "Running",
    port: PORT,
  });
});

app.post("/registrations", async (req, res) => {
  const { userId, eventId } = req.body;

  if (!userId || !eventId) {
    return res.status(400).json({
      message: "userId and eventId are required",
    });
  }

  try {
    await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
    await axios.get(`${EVENT_SERVICE_URL}/events/${eventId}`);

    const alreadyRegistered = registrations.find(
      (r) => r.userId === userId && r.eventId === eventId
    );

    if (alreadyRegistered) {
      return res.status(400).json({
        message: "User already registered for this event",
      });
    }

    const newRegistration = {
      id: registrations.length + 1,
      userId,
      eventId,
      status: "confirmed",
      createdAt: new Date(),
    };

    registrations.push(newRegistration);

    res.status(201).json({
      message: "Registration successful",
      registration: newRegistration,
    });
  } catch (error) {
    res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
});

app.get("/registrations/user/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const userRegistrations = registrations.filter((r) => r.userId === userId);
  res.json(userRegistrations);
});

app.delete("/registrations/:id", (req, res) => {
  const id = Number(req.params.id);

  const exists = registrations.find((r) => r.id === id);

  if (!exists) {
    return res.status(404).json({
      message: "Registration not found",
    });
  }

  registrations = registrations.filter((r) => r.id !== id);

  res.json({
    message: "Registration cancelled successfully",
  });
});

app.get("/metrics", (req, res) => {
  res.type("text/plain");
  res.send(`registration_service_up 1
registration_total ${registrations.length}
`);
});

app.listen(PORT, () => {
  console.log(`Registration Service running on port ${PORT}`);
});
