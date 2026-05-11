const { Pool } = require("pg");
require("dotenv").config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

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
