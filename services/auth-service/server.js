const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(cors());
app.use(express.json());


// ============================
// PostgreSQL
// ============================

const pool = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});


pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error);
});


// ============================
// Database readiness
// ============================

async function waitForDatabase() {
  while (true) {
    try {
      await pool.query("SELECT 1");
      console.log("PostgreSQL connected");
      return;
    } catch (error) {
      console.log("Waiting for PostgreSQL...");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}


// ============================
// Default Admin
// ============================

async function ensureDefaultAdmin() {
  const username = "ahmedrabie";
  const email = "ahmedelezmazy36@gmail.com";
  const password = "ahmedrabie";

  const existing = await pool.query(
    "SELECT id FROM users WHERE username = $1",
    [username]
  );

  if (existing.rows.length > 0) {
    console.log("Default admin already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `
      INSERT INTO users
        (username, email, password, role)
      VALUES
        ($1, $2, $3, 'admin')
    `,
    [username, email, passwordHash]
  );

  console.log("Default admin created");
}


// ============================
// Health
// ============================

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "auth-service",
      status: "healthy",
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      service: "auth-service",
      status: "unhealthy",
      database: "disconnected",
    });
  }
});


// ============================
// Register
// ============================

app.post("/register", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      grade
    } = req.body;

    if (!username || !email || !password || !grade) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (!["second", "third"].includes(grade)) {
      return res.status(400).json({
        message: "Invalid grade",
      });
    }

    const existing = await pool.query(
      `
        SELECT id
        FROM users
        WHERE username = $1
           OR email = $2
      `,
      [username, email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "Username or email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
        INSERT INTO users
          (username, email, password, grade, role)

        VALUES
          ($1, $2, $3, $4, 'student')

        RETURNING
          id,
          username,
          email,
          grade,
          role,
          created_at
      `,
      [
        username,
        email,
        passwordHash,
        grade,
      ]
    );

    res.status(201).json({
      message: "User registered successfully",
      user: result.rows[0],
    });

  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});


// ============================
// Login
// ============================

app.post("/login", async (req, res) => {
  try {
    const {
      username,
      password
    } = req.body;

    const result = await pool.query(
      `
        SELECT
          id,
          username,
          email,
          password,
          grade,
          role

        FROM users
        WHERE username = $1
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        grade: user.grade,
      },
      JWT_SECRET,
      {
        expiresIn: "2h",
      }
    );

    res.json({
      token,

      user: {
        userId: user.id,
        username: user.username,
        email: user.email,
        grade: user.grade,
        role: user.role,
      },
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});


// ============================
// Users
// ============================

app.get("/users", async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          username,
          email,
          grade,
          role,
          created_at

        FROM users

        ORDER BY created_at DESC
      `
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});


// ============================
// Start
// ============================

async function start() {
  try {
    await waitForDatabase();

    await ensureDefaultAdmin();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`auth-service running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

start();
