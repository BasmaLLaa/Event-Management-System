const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "event_management",
});

async function connectDB() {
  try {
    await pool.query("SELECT NOW()");
    console.log("Connected to PostgreSQL database");
  } catch (error) {
    console.error("PostgreSQL connection failed:", error.message);
    process.exit(1);
  }
}

module.exports = {
  pool,
  connectDB,
};
