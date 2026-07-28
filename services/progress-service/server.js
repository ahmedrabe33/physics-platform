const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

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
// Health
// ============================

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "progress-service",
      status: "healthy",
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      service: "progress-service",
      status: "unhealthy",
      database: "disconnected",
    });
  }
});

// ============================
// Get progress for user
// ============================

app.get("/progress/:userId", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.user_id,
        p.lesson_id,
        p.completed,
        p.score,
        p.completed_at,
        l.title AS lesson_title,
        c.title AS chapter_title,
        c.grade
      FROM progress p
      JOIN lessons l ON l.id = p.lesson_id
      JOIN chapters c ON c.id = l.chapter_id
      WHERE p.user_id = $1
      ORDER BY c.chapter_order, l.lesson_order
      `,
      [req.params.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get progress error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// ============================
// Check lesson access
// ============================

app.post("/progress/check-access", async (req, res) => {
  try {
    const {
      userId,
      lessonId,
      previousLessonId,
    } = req.body;

    if (!userId || !lessonId) {
      return res.status(400).json({
        message: "userId and lessonId are required",
      });
    }

    // First lesson is always unlocked.
    if (!previousLessonId) {
      return res.json({
        allowed: true,
        reason: "first_lesson",
      });
    }

    const result = await pool.query(
      `
      SELECT completed
      FROM progress
      WHERE user_id = $1
        AND lesson_id = $2
      `,
      [userId, previousLessonId]
    );

    if (
      result.rows.length > 0 &&
      result.rows[0].completed === true
    ) {
      return res.json({
        allowed: true,
        reason: "previous_lesson_completed",
      });
    }

    return res.status(403).json({
      allowed: false,
      reason: "previous_lesson_not_completed",
    });

  } catch (error) {
    console.error("Check access error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// ============================
// Complete lesson
// ============================

app.post("/progress/complete", async (req, res) => {
  try {
    const {
      userId,
      lessonId,
      score = 100,
    } = req.body;

    if (!userId || !lessonId) {
      return res.status(400).json({
        message: "userId and lessonId are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO progress
        (
          user_id,
          lesson_id,
          completed,
          score,
          completed_at
        )
      VALUES
        ($1, $2, TRUE, $3, NOW())

      ON CONFLICT (user_id, lesson_id)

      DO UPDATE SET
        completed = TRUE,
        score = EXCLUDED.score,
        completed_at = NOW()

      RETURNING *
      `,
      [
        userId,
        lessonId,
        score,
      ]
    );

    res.json({
      message: "Lesson completed",
      progress: result.rows[0],
    });

  } catch (error) {
    console.error("Complete lesson error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// ============================
// Get completed lesson IDs
// ============================

app.get("/progress/:userId/completed", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT lesson_id
      FROM progress
      WHERE user_id = $1
        AND completed = TRUE
      ORDER BY lesson_id
      `,
      [req.params.userId]
    );

    res.json({
      userId: req.params.userId,
      completedLessons: result.rows.map(
        (row) => row.lesson_id
      ),
    });

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

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`progress-service running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

start();
