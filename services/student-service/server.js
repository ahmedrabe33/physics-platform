const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3002;

const UPLOAD_DIR = path.join(__dirname, "uploads", "payment-proofs");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

function mapStudent(student) {
  if (!student) return null;

  return {
    id: student.id,
    userId: student.user_id,
    username: student.username,
    email: student.email,
    grade: student.grade,
    paymentProof: student.payment_proof,
    status: student.status,
    registeredAt: student.registered_at,
    approvedAt: student.approved_at,
    subscriptionExpiry: student.subscription_expiry,
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

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

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "student-service",
      status: "healthy",
      database: "connected",
    });
  } catch (error) {
    console.error("Health error:", error);

    res.status(503).json({
      service: "student-service",
      status: "unhealthy",
      database: "disconnected",
    });
  }
});

app.post("/students", upload.single("paymentProof"), async (req, res) => {
  try {
    const { userId, username, email, grade } = req.body;

    if (!userId || !username || !email || !grade) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    if (!["second", "third"].includes(grade)) {
      return res.status(400).json({
        message: "Invalid grade",
      });
    }

    const existing = await pool.query(
      "SELECT id FROM students WHERE user_id = $1",
      [userId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: "Student already exists",
      });
    }

    const paymentProof = req.file
      ? `/uploads/payment-proofs/${req.file.filename}`
      : null;

    const result = await pool.query(
      `
      INSERT INTO students
        (
          user_id,
          username,
          email,
          grade,
          payment_proof,
          status
        )
      VALUES
        ($1, $2, $3, $4, $5, 'pending')
      RETURNING *
      `,
      [userId, username, email, grade, paymentProof]
    );

    res.status(201).json({
      message: "Student created",
      student: mapStudent(result.rows[0]),
    });
  } catch (error) {
    console.error("Create student error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.get("/students", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM students
      ORDER BY registered_at DESC
    `);

    res.json(result.rows.map(mapStudent));
  } catch (error) {
    console.error("Get students error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.get("/students/:userId", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM students
      WHERE user_id = $1
      `,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    res.json(mapStudent(result.rows[0]));
  } catch (error) {
    console.error("Get student error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});


app.delete("/students/:userId", async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      message: "Invalid user ID",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const studentResult = await client.query(
      `
      SELECT payment_proof
      FROM students
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    const userResult = await client.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING id, username, email
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "User not found",
      });
    }

    await client.query("COMMIT");

    const paymentProof =
      studentResult.rows[0]?.payment_proof;

    if (paymentProof) {
      const filename = path.basename(paymentProof);
      const filePath = path.join(UPLOAD_DIR, filename);

      fs.unlink(filePath, (error) => {
        if (error && error.code !== "ENOENT") {
          console.error(
            "Delete payment proof error:",
            error
          );
        }
      });
    }

    res.json({
      message: "Account deleted successfully",
      user: userResult.rows[0],
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Delete student account error:",
      error
    );

    res.status(500).json({
      message: "Internal server error",
    });

  } finally {
    client.release();
  }
});


app.post("/students/:userId/approve", async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE students
      SET
        status = 'approved',
        approved_at = NOW(),
        subscription_expiry = NOW() + INTERVAL '1 month'
      WHERE user_id = $1
      RETURNING *
      `,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    res.json({
      message: "Student approved",
      student: mapStudent(result.rows[0]),
    });
  } catch (error) {
    console.error("Approve student error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/students/:userId/reject", async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE students
      SET status = 'rejected'
      WHERE user_id = $1
      RETURNING *
      `,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    res.json({
      message: "Student rejected",
      student: mapStudent(result.rows[0]),
    });
  } catch (error) {
    console.error("Reject student error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/students/:userId/renew", async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE students
      SET
        status = 'approved',
        subscription_expiry =
          CASE
            WHEN subscription_expiry IS NULL
              OR subscription_expiry < NOW()
            THEN NOW() + INTERVAL '1 month'
            ELSE subscription_expiry + INTERVAL '1 month'
          END
      WHERE user_id = $1
      RETURNING *
      `,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    res.json({
      message: "Subscription renewed",
      student: mapStudent(result.rows[0]),
    });
  } catch (error) {
    console.error("Renew student error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.get("/students/:userId/access", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM students
      WHERE user_id = $1
      `,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "not_found",
      });
    }

    const student = mapStudent(result.rows[0]);

    if (student.status === "pending") {
      return res.status(403).json({
        status: "pending",
        student,
      });
    }

    if (student.status === "rejected") {
      return res.status(403).json({
        status: "rejected",
        student,
      });
    }

    if (
      !student.subscriptionExpiry ||
      new Date(student.subscriptionExpiry) < new Date()
    ) {
      return res.status(403).json({
        status: "expired",
        student,
      });
    }

    res.json({
      status: "approved",
      student,
    });
  } catch (error) {
    console.error("Access check error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

async function start() {
  try {
    await waitForDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`student-service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Student service startup failed:", error);
    process.exit(1);
  }
}

start();
