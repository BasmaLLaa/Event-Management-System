require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, initDb, checkDbConnection } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const DATABASE_UNAVAILABLE_MESSAGE = 'Database unavailable. Please try again later.';

app.use(cors());
app.use(express.json());

async function ensureDatabaseAvailable(res) {
  const connected = await checkDbConnection();

  if (!connected) {
    res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    return false;
  }

  return true;
}

function getCleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isDatabaseUnavailableError(error) {
  const databaseErrorCodes = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ETIMEDOUT',
    'ECONNRESET',
    '57P01',
    '08000',
    '08003',
    '08006',
  ]);

  return databaseErrorCodes.has(error.code);
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'user-service',
  });
});

app.get('/health/db', async (req, res) => {
  const connected = await checkDbConnection();

  if (!connected) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: 'Database is not reachable',
    });
  }

  return res.status(200).json({
    status: 'ok',
    database: 'connected',
  });
});

app.post('/users/register', async (req, res) => {
  const name = getCleanString(req.body.name);
  const email = getCleanString(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  if (!(await ensureDatabaseAvailable(res))) {
    return undefined;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `
        INSERT INTO users (name, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, created_at
      `,
      [name, email, passwordHash],
    );

    return res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email already exists' });
    }

    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    }

    console.error(`[Register] Unexpected error: ${error.message}`);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
});

app.post('/users/login', async (req, res) => {
  const email = getCleanString(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (!(await ensureDatabaseAvailable(res))) {
    return undefined;
  }

  if (!process.env.JWT_SECRET) {
    console.error('[Auth] JWT_SECRET is not configured.');
    return res.status(500).json({ message: 'JWT secret is not configured' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    }

    console.error(`[Login] Unexpected error: ${error.message}`);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
});

app.get('/users/:id', async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'User ID must be a positive number' });
  }

  if (!(await ensureDatabaseAvailable(res))) {
    return undefined;
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ message: DATABASE_UNAVAILABLE_MESSAGE });
    }

    console.error(`[GetUserById] Unexpected error: ${error.message}`);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }

  console.error(`[Server] Unexpected error: ${error.message}`);
  return res.status(500).json({ message: 'Unexpected server error' });
});

app.listen(PORT, () => {
  console.log(`User Service is running on port ${PORT}`);

  initDb().then((connected) => {
    if (!connected) {
      console.error(
        '[Startup] PostgreSQL connection failed. Database-dependent routes will return 503 until PostgreSQL is reachable.',
      );
    }
  });
});
