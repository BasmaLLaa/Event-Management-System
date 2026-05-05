require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 3000,
});

const createUsersTableQuery = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

let usersTableReady = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prepareDatabase() {
  await pool.query('SELECT 1');

  if (!usersTableReady) {
    await pool.query(createUsersTableQuery);
    usersTableReady = true;
  }
}

async function initDb(maxRetries = 5, retryDelayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await prepareDatabase();
      console.log('[Database] PostgreSQL connected. Users table is ready.');
      return true;
    } catch (error) {
      usersTableReady = false;
      console.error(
        `[Database] PostgreSQL unavailable (attempt ${attempt}/${maxRetries}): ${error.message}`,
      );

      if (attempt < maxRetries) {
        console.log(`[Database] Retrying in ${retryDelayMs / 1000} seconds...`);
        await wait(retryDelayMs);
      }
    }
  }

  console.error(
    '[Database] PostgreSQL is unavailable after startup retries. The app is still running. /health works, /health/db reports disconnected, and user routes return 503 until PostgreSQL is reachable.',
  );
  return false;
}

async function checkDbConnection() {
  try {
    await prepareDatabase();
    return true;
  } catch (error) {
    usersTableReady = false;
    return false;
  }
}

pool.on('error', (error) => {
  usersTableReady = false;
  console.error(`[Database] Unexpected PostgreSQL pool error: ${error.message}`);
});

module.exports = {
  pool,
  initDb,
  checkDbConnection,
};
