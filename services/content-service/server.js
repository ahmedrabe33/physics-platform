const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());


// ======================================================
// PostgreSQL
// ======================================================

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


// ======================================================
// Mappers
// ======================================================

function mapExercise(row) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    question: row.question,
    correctAnswer: row.correct_answer,
    exerciseOrder: row.exercise_order,
    order: row.exercise_order,
  };
}

function mapTopic(row) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    topicOrder: row.topic_order,
    order: row.topic_order,
    createdAt: row.created_at,
  };
}

function mapLesson(row, exercises = [], topics = []) {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    lessonOrder: row.lesson_order,
    order: row.lesson_order,
    createdAt: row.created_at,
    topics: topics.map(mapTopic),
    exercises: exercises.map(mapExercise),
  };
}

function mapChapter(row, lessons = []) {
  return {
    id: row.id,
    grade: row.grade,
    title: row.title,
    chapterOrder: row.chapter_order,
    order: row.chapter_order,
    createdAt: row.created_at,
    lessons,
  };
}


// ======================================================
// Helpers
// ======================================================

async function waitForDatabase() {
  while (true) {
    try {
      await pool.query("SELECT 1");
      console.log("PostgreSQL connected");
      return;
    } catch (error) {
      console.log("Waiting for PostgreSQL...");

      await new Promise((resolve) => {
        setTimeout(resolve, 3000);
      });
    }
  }
}


async function getLessonDetails(lessonRow) {
  const [topicsResult, exercisesResult] =
    await Promise.all([
      pool.query(
        `
        SELECT *
        FROM lesson_topics
        WHERE lesson_id = $1
        ORDER BY topic_order, id
        `,
        [lessonRow.id]
      ),

      pool.query(
        `
        SELECT *
        FROM exercises
        WHERE lesson_id = $1
        ORDER BY exercise_order, id
        `,
        [lessonRow.id]
      ),
    ]);

  return mapLesson(
    lessonRow,
    exercisesResult.rows,
    topicsResult.rows
  );
}


async function getChapterWithLessons(chapterRow) {
  const lessonsResult =
    await pool.query(
      `
      SELECT *
      FROM lessons
      WHERE chapter_id = $1
      ORDER BY lesson_order, id
      `,
      [chapterRow.id]
    );

  const lessons =
    await Promise.all(
      lessonsResult.rows.map(
        (lesson) =>
          getLessonDetails(lesson)
      )
    );

  return mapChapter(
    chapterRow,
    lessons
  );
}


async function validateGrade(grade) {
  return (
    grade === "second" ||
    grade === "third"
  );
}


async function lessonBelongsToGrade(
  lessonId,
  grade
) {
  const result =
    await pool.query(
      `
      SELECT l.id
      FROM lessons l
      JOIN chapters c
        ON c.id = l.chapter_id
      WHERE l.id = $1
      AND c.grade = $2
      `,
      [
        lessonId,
        grade,
      ]
    );

  return result.rows.length > 0;
}


// ======================================================
// Health
// ======================================================

app.get(
  "/health",

  async (req, res) => {
    try {
      await pool.query("SELECT 1");

      res.json({
        service: "content-service",
        status: "healthy",
        database: "connected",
      });
    } catch (error) {
      res.status(503).json({
        service: "content-service",
        status: "unhealthy",
      });
    }
  }
);


// ======================================================
// Get all content
// ======================================================

app.get(
  "/content",

  async (req, res) => {
    try {
      const chaptersResult =
        await pool.query(
          `
          SELECT *
          FROM chapters
          ORDER BY grade, chapter_order, id
          `
        );

      const response = {
        second: {
          chapters: [],
        },

        third: {
          chapters: [],
        },
      };

      for (
        const chapter
        of chaptersResult.rows
      ) {
        if (!response[chapter.grade]) {
          continue;
        }

        const mappedChapter =
          await getChapterWithLessons(
            chapter
          );

        response[
          chapter.grade
        ].chapters.push(
          mappedChapter
        );
      }

      res.json(response);
    } catch (error) {
      console.error(
        "Get content error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


// ======================================================
// Get content by grade
// ======================================================

app.get(
  "/content/:grade",

  async (req, res) => {
    try {
      const {
        grade,
      } = req.params;

      if (
        !(await validateGrade(grade))
      ) {
        return res
          .status(400)
          .json({
            message:
              "Invalid grade",
          });
      }

      const chaptersResult =
        await pool.query(
          `
          SELECT *
          FROM chapters
          WHERE grade = $1
          ORDER BY chapter_order, id
          `,
          [grade]
        );

      const chapters =
        await Promise.all(
          chaptersResult.rows.map(
            (chapter) =>
              getChapterWithLessons(
                chapter
              )
          )
        );

      res.json({
        grade,
        chapters,
      });
    } catch (error) {
      console.error(
        "Get grade content error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


// ======================================================
// Chapter CRUD
// ======================================================

app.post(
  "/content/:grade/chapters",

  async (req, res) => {
    try {
      const {
        grade,
      } = req.params;

      const {
        title,
        chapterOrder,
      } = req.body;

      if (
        !(await validateGrade(grade))
      ) {
        return res
          .status(400)
          .json({
            message:
              "Invalid grade",
          });
      }

      if (!title) {
        return res
          .status(400)
          .json({
            message:
              "Chapter title is required",
          });
      }

      let finalOrder =
        chapterOrder;

      if (
        finalOrder === undefined ||
        finalOrder === null ||
        finalOrder === ""
      ) {
        const orderResult =
          await pool.query(
            `
            SELECT
              COALESCE(
                MAX(chapter_order),
                0
              ) + 1
              AS next_order
            FROM chapters
            WHERE grade = $1
            `,
            [grade]
          );

        finalOrder =
          orderResult.rows[0]
            .next_order;
      }

      const result =
        await pool.query(
          `
          INSERT INTO chapters
          (
            grade,
            title,
            chapter_order
          )

          VALUES
          (
            $1,
            $2,
            $3
          )

          RETURNING *
          `,
          [
            grade,
            title,
            finalOrder,
          ]
        );

      res.status(201).json({
        message:
          "Chapter created",

        chapter:
          mapChapter(
            result.rows[0],
            []
          ),
      });
    } catch (error) {
      console.error(
        "Create chapter error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.put(
  "/content/:grade/chapters/:chapterId",

  async (req, res) => {
    try {
      const {
        grade,
        chapterId,
      } = req.params;

      const {
        title,
        chapterOrder,
      } = req.body;

      const result =
        await pool.query(
          `
          UPDATE chapters

          SET
            title =
              COALESCE(
                $1,
                title
              ),

            chapter_order =
              COALESCE(
                $2,
                chapter_order
              )

          WHERE id = $3
          AND grade = $4

          RETURNING *
          `,
          [
            title ?? null,
            chapterOrder ?? null,
            chapterId,
            grade,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Chapter not found",
          });
      }

      res.json({
        message:
          "Chapter updated",

        chapter:
          mapChapter(
            result.rows[0],
            []
          ),
      });
    } catch (error) {
      console.error(
        "Update chapter error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.delete(
  "/content/:grade/chapters/:chapterId",

  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          DELETE FROM chapters
          WHERE id = $1
          AND grade = $2
          RETURNING id
          `,
          [
            req.params.chapterId,
            req.params.grade,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Chapter not found",
          });
      }

      res.json({
        message:
          "Chapter deleted",
      });
    } catch (error) {
      console.error(
        "Delete chapter error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


// ======================================================
// Lesson CRUD
// ======================================================

app.post(
  "/content/:grade/chapters/:chapterId/lessons",

  async (req, res) => {
    try {
      const {
        grade,
        chapterId,
      } = req.params;

      const {
        title,
        description,
        videoUrl,
        lessonOrder,
      } = req.body;

      if (!title) {
        return res
          .status(400)
          .json({
            message:
              "Lesson title is required",
          });
      }

      const chapterResult =
        await pool.query(
          `
          SELECT id
          FROM chapters
          WHERE id = $1
          AND grade = $2
          `,
          [
            chapterId,
            grade,
          ]
        );

      if (
        chapterResult.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Chapter not found",
          });
      }

      let finalOrder =
        lessonOrder;

      if (
        finalOrder === undefined ||
        finalOrder === null ||
        finalOrder === ""
      ) {
        const orderResult =
          await pool.query(
            `
            SELECT
              COALESCE(
                MAX(lesson_order),
                0
              ) + 1
              AS next_order
            FROM lessons
            WHERE chapter_id = $1
            `,
            [chapterId]
          );

        finalOrder =
          orderResult.rows[0]
            .next_order;
      }

      const result =
        await pool.query(
          `
          INSERT INTO lessons
          (
            chapter_id,
            title,
            description,
            video_url,
            lesson_order
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )

          RETURNING *
          `,
          [
            chapterId,
            title,
            description || null,
            videoUrl || null,
            finalOrder,
          ]
        );

      res.status(201).json({
        message:
          "Lesson created",

        lesson:
          mapLesson(
            result.rows[0]
          ),
      });
    } catch (error) {
      console.error(
        "Create lesson error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.get(
  "/content/:grade/lessons/:lessonId",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
      } = req.params;

      const lessonResult =
        await pool.query(
          `
          SELECT
            l.*,
            c.grade

          FROM lessons l

          JOIN chapters c
            ON c.id =
               l.chapter_id

          WHERE l.id = $1
          AND c.grade = $2
          `,
          [
            lessonId,
            grade,
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

      const lesson =
        await getLessonDetails(
          lessonResult.rows[0]
        );

      res.json({
        ...lesson,
        grade,
      });
    } catch (error) {
      console.error(
        "Get lesson error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.put(
  "/content/:grade/lessons/:lessonId",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
      } = req.params;

      const {
        title,
        description,
        videoUrl,
        lessonOrder,
      } = req.body;

      const valid =
        await lessonBelongsToGrade(
          lessonId,
          grade
        );

      if (!valid) {
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
          UPDATE lessons

          SET
            title =
              COALESCE(
                $1,
                title
              ),

            description =
              $2,

            video_url =
              $3,

            lesson_order =
              COALESCE(
                $4,
                lesson_order
              )

          WHERE id = $5

          RETURNING *
          `,
          [
            title ?? null,
            description ?? null,
            videoUrl ?? null,
            lessonOrder ?? null,
            lessonId,
          ]
        );

      const lesson =
        await getLessonDetails(
          result.rows[0]
        );

      res.json({
        message:
          "Lesson updated",

        lesson,
      });
    } catch (error) {
      console.error(
        "Update lesson error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.delete(
  "/content/:grade/lessons/:lessonId",

  async (req, res) => {
    try {
      const valid =
        await lessonBelongsToGrade(
          req.params.lessonId,
          req.params.grade
        );

      if (!valid) {
        return res
          .status(404)
          .json({
            message:
              "Lesson not found",
          });
      }

      await pool.query(
        `
        DELETE FROM lessons
        WHERE id = $1
        `,
        [
          req.params.lessonId,
        ]
      );

      res.json({
        message:
          "Lesson deleted",
      });
    } catch (error) {
      console.error(
        "Delete lesson error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


// ======================================================
// Topic CRUD
// ======================================================

app.post(
  "/content/:grade/lessons/:lessonId/topics",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
      } = req.params;

      const {
        title,
        description,
        videoUrl,
        topicOrder,
      } = req.body;

      if (!title) {
        return res
          .status(400)
          .json({
            message:
              "Topic title is required",
          });
      }

      const valid =
        await lessonBelongsToGrade(
          lessonId,
          grade
        );

      if (!valid) {
        return res
          .status(404)
          .json({
            message:
              "Lesson not found",
          });
      }

      let finalOrder =
        topicOrder;

      if (
        finalOrder === undefined ||
        finalOrder === null ||
        finalOrder === ""
      ) {
        const orderResult =
          await pool.query(
            `
            SELECT
              COALESCE(
                MAX(topic_order),
                0
              ) + 1
              AS next_order
            FROM lesson_topics
            WHERE lesson_id = $1
            `,
            [
              lessonId,
            ]
          );

        finalOrder =
          orderResult.rows[0]
            .next_order;
      }

      const result =
        await pool.query(
          `
          INSERT INTO lesson_topics
          (
            lesson_id,
            title,
            description,
            video_url,
            topic_order
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5
          )

          RETURNING *
          `,
          [
            lessonId,
            title,
            description || null,
            videoUrl || null,
            finalOrder,
          ]
        );

      res.status(201).json({
        message:
          "Topic created",

        topic:
          mapTopic(
            result.rows[0]
          ),
      });
    } catch (error) {
      console.error(
        "Create topic error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.put(
  "/content/:grade/lessons/:lessonId/topics/:topicId",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
        topicId,
      } = req.params;

      const {
        title,
        description,
        videoUrl,
        topicOrder,
      } = req.body;

      const valid =
        await lessonBelongsToGrade(
          lessonId,
          grade
        );

      if (!valid) {
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
          UPDATE lesson_topics

          SET
            title =
              COALESCE(
                $1,
                title
              ),

            description =
              $2,

            video_url =
              $3,

            topic_order =
              COALESCE(
                $4,
                topic_order
              )

          WHERE id = $5
          AND lesson_id = $6

          RETURNING *
          `,
          [
            title ?? null,
            description ?? null,
            videoUrl ?? null,
            topicOrder ?? null,
            topicId,
            lessonId,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Topic not found",
          });
      }

      res.json({
        message:
          "Topic updated",

        topic:
          mapTopic(
            result.rows[0]
          ),
      });
    } catch (error) {
      console.error(
        "Update topic error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.delete(
  "/content/:grade/lessons/:lessonId/topics/:topicId",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
        topicId,
      } = req.params;

      const valid =
        await lessonBelongsToGrade(
          lessonId,
          grade
        );

      if (!valid) {
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
          DELETE FROM lesson_topics

          WHERE id = $1
          AND lesson_id = $2

          RETURNING id
          `,
          [
            topicId,
            lessonId,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Topic not found",
          });
      }

      res.json({
        message:
          "Topic deleted",
      });
    } catch (error) {
      console.error(
        "Delete topic error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


// ======================================================
// Exercise CRUD
// ======================================================

app.post(
  "/content/:grade/lessons/:lessonId/exercises",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
      } = req.params;

      const {
        question,
        correctAnswer,
        exerciseOrder,
      } = req.body;

      if (
        !question ||
        !correctAnswer
      ) {
        return res
          .status(400)
          .json({
            message:
              "Question and correctAnswer are required",
          });
      }

      const valid =
        await lessonBelongsToGrade(
          lessonId,
          grade
        );

      if (!valid) {
        return res
          .status(404)
          .json({
            message:
              "Lesson not found",
          });
      }

      let finalOrder =
        exerciseOrder;

      if (
        finalOrder === undefined ||
        finalOrder === null ||
        finalOrder === ""
      ) {
        const orderResult =
          await pool.query(
            `
            SELECT
              COALESCE(
                MAX(exercise_order),
                0
              ) + 1
              AS next_order
            FROM exercises
            WHERE lesson_id = $1
            `,
            [
              lessonId,
            ]
          );

        finalOrder =
          orderResult.rows[0]
            .next_order;
      }

      const result =
        await pool.query(
          `
          INSERT INTO exercises
          (
            lesson_id,
            question,
            correct_answer,
            exercise_order
          )

          VALUES
          (
            $1,
            $2,
            $3,
            $4
          )

          RETURNING *
          `,
          [
            lessonId,
            question,
            correctAnswer,
            finalOrder,
          ]
        );

      res.status(201).json({
        message:
          "Exercise created",

        exercise:
          mapExercise(
            result.rows[0]
          ),
      });
    } catch (error) {
      console.error(
        "Create exercise error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.put(
  "/content/:grade/lessons/:lessonId/exercises/:exerciseId",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
        exerciseId,
      } = req.params;

      const {
        question,
        correctAnswer,
        exerciseOrder,
      } = req.body;

      const valid =
        await lessonBelongsToGrade(
          lessonId,
          grade
        );

      if (!valid) {
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
          UPDATE exercises

          SET
            question =
              COALESCE(
                $1,
                question
              ),

            correct_answer =
              COALESCE(
                $2,
                correct_answer
              ),

            exercise_order =
              COALESCE(
                $3,
                exercise_order
              )

          WHERE id = $4
          AND lesson_id = $5

          RETURNING *
          `,
          [
            question ?? null,
            correctAnswer ?? null,
            exerciseOrder ?? null,
            exerciseId,
            lessonId,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Exercise not found",
          });
      }

      res.json({
        message:
          "Exercise updated",

        exercise:
          mapExercise(
            result.rows[0]
          ),
      });
    } catch (error) {
      console.error(
        "Update exercise error:",
        error
      );

      res.status(500).json({
        message:
          "Internal server error",
      });
    }
  }
);


app.delete(
  "/content/:grade/lessons/:lessonId/exercises/:exerciseId",

  async (req, res) => {
    try {
      const {
        grade,
        lessonId,
        exerciseId,
      } = req.params;

      const valid =
        await lessonBelongsToGrade(
          lessonId,
          grade
        );

      if (!valid) {
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
          DELETE FROM exercises

          WHERE id = $1
          AND lesson_id = $2

          RETURNING id
          `,
          [
            exerciseId,
            lessonId,
          ]
        );

      if (
        result.rows.length === 0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Exercise not found",
          });
      }

      res.json({
        message:
          "Exercise deleted",
      });
    } catch (error) {
      console.error(
        "Delete exercise error:",
        error
      );

      res.status(500).json({
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
          `content-service running on port ${PORT}`
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
