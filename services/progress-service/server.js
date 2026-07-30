const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3004;


// ======================================================
// Middleware
// ======================================================

app.use(cors());
app.use(express.json());


// ======================================================
// PostgreSQL
// ======================================================

const pool = new Pool({
  host:
    process.env.DB_HOST ||
    "postgres",

  port:
    Number(
      process.env.DB_PORT ||
      5432
    ),

  user:
    process.env.POSTGRES_USER,

  password:
    process.env.POSTGRES_PASSWORD,

  database:
    process.env.POSTGRES_DB,
});


pool.on(
  "error",
  (error) => {
    console.error(
      "Unexpected PostgreSQL error:",
      error
    );
  }
);


// ======================================================
// Helpers
// ======================================================

function mapProgress(row) {
  return {
    id:
      row.id,

    userId:
      row.user_id,

    lessonId:
      row.lesson_id,

    completed:
      row.completed,

    score:
      row.score,

    completedAt:
      row.completed_at,
  };
}


function mapVideoView(row) {
  return {
    id:
      row.id,

    userId:
      row.user_id,

    username:
      row.username || null,

    email:
      row.email || null,

    lessonId:
      row.lesson_id,

    lessonTitle:
      row.lesson_title || null,

    chapterId:
      row.chapter_id || null,

    chapterTitle:
      row.chapter_title || null,

    grade:
      row.grade || null,

    topicId:
      row.topic_id || null,

    topicTitle:
      row.topic_title || null,

    videoUrl:
      row.video_url,

    openedAt:
      row.opened_at,
  };
}


// ======================================================
// Wait for database
// ======================================================

async function waitForDatabase() {
  while (true) {
    try {

      await pool.query(
        "SELECT 1"
      );

      console.log(
        "PostgreSQL connected"
      );

      return;

    } catch (error) {

      console.log(
        "Waiting for PostgreSQL..."
      );

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            3000
          )
      );

    }
  }
}


// ======================================================
// Health
// ======================================================

app.get(
  "/health",

  async (req, res) => {

    try {

      await pool.query(
        "SELECT 1"
      );

      res.json({
        service:
          "progress-service",

        status:
          "healthy",

        database:
          "connected",
      });

    } catch (error) {

      res
        .status(503)
        .json({
          service:
            "progress-service",

          status:
            "unhealthy",
        });

    }

  }
);


// ======================================================
// Get student progress
// ======================================================

app.get(
  "/progress/:userId",

  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            user_id,
            lesson_id,
            completed,
            score,
            completed_at

          FROM progress

          WHERE user_id = $1

          ORDER BY lesson_id
          `,
          [
            req.params.userId,
          ]
        );


      res.json(
        result.rows.map(
          mapProgress
        )
      );

    } catch (error) {

      console.error(
        "Get progress error:",
        error
      );

      res
        .status(500)
        .json({
          message:
            "Internal server error",
        });

    }

  }
);


// ======================================================
// Check lesson access
// ======================================================

app.post(
  "/progress/check-access",

  async (req, res) => {

    try {

      const {
        userId,
        lessonId,
        previousLessonId,
      } = req.body;


      if (
        !userId ||
        !lessonId
      ) {

        return res
          .status(400)
          .json({
            message:
              "userId and lessonId are required",
          });

      }


      const lessonResult =
        await pool.query(
          `
          SELECT id
          FROM lessons
          WHERE id = $1
          `,
          [
            lessonId,
          ]
        );


      if (
        lessonResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            message:
              "Lesson not found",
          });

      }


      // First lesson has no previous lesson.
      if (!previousLessonId) {

        return res.json({
          allowed:
            true,
        });

      }


      // Already completed lesson remains accessible.
      const currentProgress =
        await pool.query(
          `
          SELECT completed

          FROM progress

          WHERE user_id = $1
          AND lesson_id = $2
          `,
          [
            userId,
            lessonId,
          ]
        );


      if (
        currentProgress.rows[0]
          ?.completed === true
      ) {

        return res.json({
          allowed:
            true,
        });

      }


      const previousProgress =
        await pool.query(
          `
          SELECT completed

          FROM progress

          WHERE user_id = $1
          AND lesson_id = $2
          `,
          [
            userId,
            previousLessonId,
          ]
        );


      if (
        previousProgress.rows.length === 0 ||
        previousProgress.rows[0]
          .completed !== true
      ) {

        return res
          .status(403)
          .json({
            allowed:
              false,

            message:
              "Previous lesson must be completed first",
          });

      }


      res.json({
        allowed:
          true,
      });

    } catch (error) {

      console.error(
        "Check access error:",
        error
      );

      res
        .status(500)
        .json({
          message:
            "Internal server error",
        });

    }

  }
);


// ======================================================
// Complete lesson
// ======================================================

app.post(
  "/progress/complete",

  async (req, res) => {

    try {

      const {
        userId,
        lessonId,
        score = 100,
      } = req.body;


      if (
        !userId ||
        !lessonId
      ) {

        return res
          .status(400)
          .json({
            message:
              "userId and lessonId are required",
          });

      }


      const userResult =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          `,
          [
            userId,
          ]
        );


      if (
        userResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            message:
              "User not found",
          });

      }


      const lessonResult =
        await pool.query(
          `
          SELECT id
          FROM lessons
          WHERE id = $1
          `,
          [
            lessonId,
          ]
        );


      if (
        lessonResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            message:
              "Lesson not found",
          });

      }


      const result =
        await pool.query(
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
          (
            $1,
            $2,
            TRUE,
            $3,
            NOW()
          )

          ON CONFLICT
          (
            user_id,
            lesson_id
          )

          DO UPDATE SET

            completed =
              TRUE,

            score =
              EXCLUDED.score,

            completed_at =
              COALESCE(
                progress.completed_at,
                NOW()
              )

          RETURNING *
          `,
          [
            userId,
            lessonId,
            score,
          ]
        );


      res.json({
        message:
          "Lesson completed successfully",

        progress:
          mapProgress(
            result.rows[0]
          ),
      });

    } catch (error) {

      console.error(
        "Complete lesson error:",
        error
      );

      res
        .status(500)
        .json({
          message:
            "Internal server error",
        });

    }

  }
);


// ======================================================
// Get completed lessons
// ======================================================

app.get(
  "/progress/:userId/completed",

  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            user_id,
            lesson_id,
            completed,
            score,
            completed_at

          FROM progress

          WHERE user_id = $1
          AND completed = TRUE

          ORDER BY completed_at
          `,
          [
            req.params.userId,
          ]
        );


      res.json(
        result.rows.map(
          mapProgress
        )
      );

    } catch (error) {

      console.error(
        "Get completed lessons error:",
        error
      );

      res
        .status(500)
        .json({
          message:
            "Internal server error",
        });

    }

  }
);


// ======================================================
// Track video view
// ======================================================

app.post(
  "/progress/video-view",

  async (req, res) => {

    try {

      const {
        userId,
        lessonId,
        topicId,
        videoUrl,
      } = req.body;


      if (
        !userId ||
        !lessonId
      ) {

        return res
          .status(400)
          .json({
            message:
              "userId and lessonId are required",
          });

      }


      // Validate user
      const userResult =
        await pool.query(
          `
          SELECT id

          FROM users

          WHERE id = $1
          `,
          [
            userId,
          ]
        );


      if (
        userResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            message:
              "User not found",
          });

      }


      // Validate lesson
      const lessonResult =
        await pool.query(
          `
          SELECT id

          FROM lessons

          WHERE id = $1
          `,
          [
            lessonId,
          ]
        );


      if (
        lessonResult.rows.length === 0
      ) {

        return res
          .status(404)
          .json({
            message:
              "Lesson not found",
          });

      }


      // Validate topic if supplied.
      if (topicId) {

        const topicResult =
          await pool.query(
            `
            SELECT id

            FROM lesson_topics

            WHERE id = $1
            AND lesson_id = $2
            `,
            [
              topicId,
              lessonId,
            ]
          );


        if (
          topicResult.rows.length === 0
        ) {

          return res
            .status(400)
            .json({
              message:
                "Topic does not belong to this lesson",
            });

        }

      }


      const result =
        await pool.query(
          `
          INSERT INTO video_views
          (
            user_id,
            lesson_id,
            topic_id,
            video_url,
            opened_at
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            NOW()
          )

          RETURNING *
          `,
          [
            userId,
            lessonId,
            topicId || null,
            videoUrl || null,
          ]
        );


      res
        .status(201)
        .json({
          message:
            "Video view recorded",

          view: {
            id:
              result.rows[0].id,

            userId:
              result.rows[0]
                .user_id,

            lessonId:
              result.rows[0]
                .lesson_id,

            topicId:
              result.rows[0]
                .topic_id,

            videoUrl:
              result.rows[0]
                .video_url,

            openedAt:
              result.rows[0]
                .opened_at,
          },
        });

    } catch (error) {

      console.error(
        "Track video view error:",
        error
      );

      res
        .status(500)
        .json({
          message:
            "Internal server error",
        });

    }

  }
);


// ======================================================
// Admin - All video views
// ======================================================

app.get(
  "/progress/admin/video-views",

  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT

            vv.id,

            vv.user_id,

            u.username,

            u.email,

            vv.lesson_id,

            l.title
              AS lesson_title,

            l.chapter_id,

            c.title
              AS chapter_title,

            c.grade,

            vv.topic_id,

            lt.title
              AS topic_title,

            vv.video_url,

            vv.opened_at

          FROM video_views vv

          JOIN users u
            ON u.id =
               vv.user_id

          JOIN lessons l
            ON l.id =
               vv.lesson_id

          JOIN chapters c
            ON c.id =
               l.chapter_id

          LEFT JOIN lesson_topics lt
            ON lt.id =
               vv.topic_id

          ORDER BY
            vv.opened_at DESC
          `
        );


      res.json(
        result.rows.map(
          mapVideoView
        )
      );

    } catch (error) {

      console.error(
        "Admin video views error:",
        error
      );

      res
        .status(500)
        .json({
          message:
            "Internal server error",
        });

    }

  }
);


// ======================================================
// Admin - Video views for one student
// ======================================================

app.get(
  "/progress/admin/video-views/:userId",

  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT

            vv.id,

            vv.user_id,

            u.username,

            u.email,

            vv.lesson_id,

            l.title
              AS lesson_title,

            l.chapter_id,

            c.title
              AS chapter_title,

            c.grade,

            vv.topic_id,

            lt.title
              AS topic_title,

            vv.video_url,

            vv.opened_at

          FROM video_views vv

          JOIN users u
            ON u.id =
               vv.user_id

          JOIN lessons l
            ON l.id =
               vv.lesson_id

          JOIN chapters c
            ON c.id =
               l.chapter_id

          LEFT JOIN lesson_topics lt
            ON lt.id =
               vv.topic_id

          WHERE
            vv.user_id = $1

          ORDER BY
            vv.opened_at DESC
          `,
          [
            req.params.userId,
          ]
        );


      res.json(
        result.rows.map(
          mapVideoView
        )
      );

    } catch (error) {

      console.error(
        "Student video views error:",
        error
      );

      res
        .status(500)
        .json({
          message:
            "Internal server error",
        });

    }

  }
);


// ======================================================
// Start
// ======================================================

async function start() {

  try {

    await waitForDatabase();


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `progress-service running on port ${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      "Startup failed:",
      error
    );

    process.exit(1);

  }

}


start();
