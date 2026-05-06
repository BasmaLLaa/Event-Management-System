const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "postgres",
        database: process.env.DB_NAME || "event_management",
      }
);

async function connectDB() {
  const maxAttempts = Number(process.env.DB_CONNECT_RETRIES || 10);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query("SELECT NOW()");
      console.log("Connected to PostgreSQL database");
      return;
    } catch (error) {
      console.error(
        `PostgreSQL connection failed (${attempt}/${maxAttempts}):`,
        error.message
      );

      if (attempt === maxAttempts) {
        process.exit(1);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

module.exports = {
  pool,
  connectDB,
};
