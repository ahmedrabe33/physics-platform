const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3003;

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
// Helpers
// ============================

function mapExercise(exercise) {
  return {
    id: exercise.id,
    lessonId: exercise.lesson_id,
    question: exercise.question,
    correctAnswer: exercise.correct_answer,
    exerciseOrder: exercise.exercise_order,
  };
}

function mapLesson(lesson, exercises = []) {
  return {
    id: lesson.id,
    chapterId: lesson.chapter_id,
    title: lesson.title,
    description: lesson.description,
    videoUrl: lesson.video_url,
    lessonOrder: lesson.lesson_order,
    exercises,
  };
}

function mapChapter(chapter, lessons = []) {
  return {
    id: chapter.id,
    grade: chapter.grade,
    title: chapter.title,
    chapterOrder: chapter.chapter_order,
    lessons,
  };
}

async function getChapterWithLessons(chapter) {
  const lessonsResult = await pool.query(
    `
    SELECT *
    FROM lessons
    WHERE chapter_id = $1
    ORDER BY lesson_order, id
    `,
    [chapter.id]
  );

  const lessons = [];

  for (const lesson of lessonsResult.rows) {
    const exercisesResult = await pool.query(
      `
      SELECT *
      FROM exercises
      WHERE lesson_id = $1
      ORDER BY exercise_order, id
      `,
      [lesson.id]
    );

    lessons.push(
      mapLesson(
        lesson,
        exercisesResult.rows.map(mapExercise)
      )
    );
  }

  return mapChapter(chapter, lessons);
}

// ============================
// Health
// ============================

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "content-service",
      status: "healthy",
      database: "connected",
    });
  } catch (error) {
    console.error("Health error:", error);

    res.status(503).json({
      service: "content-service",
      status: "unhealthy",
      database: "disconnected",
    });
  }
});

// ============================
// Get ALL content
// Frontend expects:
// {
//   second: { chapters: [] },
//   third:  { chapters: [] }
// }
// ============================

app.get("/content", async (req, res) => {
  try {
    const content = {
      second: {
        chapters: [],
      },
      third: {
        chapters: [],
      },
    };

    for (const grade of ["second", "third"]) {
      const chaptersResult = await pool.query(
        `
        SELECT *
        FROM chapters
        WHERE grade = $1
        ORDER BY chapter_order, id
        `,
        [grade]
      );

      for (const chapter of chaptersResult.rows) {
        const mappedChapter = await getChapterWithLessons(chapter);

        content[grade].chapters.push(mappedChapter);
      }
    }

    res.json(content);
  } catch (error) {
    console.error("Get all content error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// ============================
// Get content by grade
// ============================

app.get("/content/:grade", async (req, res) => {
  try {
    const grade = req.params.grade;

    if (!["second", "third"].includes(grade)) {
      return res.status(400).json({
        message: "Invalid grade",
      });
    }

    const chaptersResult = await pool.query(
      `
      SELECT *
      FROM chapters
      WHERE grade = $1
      ORDER BY chapter_order, id
      `,
      [grade]
    );

    const chapters = [];

    for (const chapter of chaptersResult.rows) {
      chapters.push(
        await getChapterWithLessons(chapter)
      );
    }

    res.json({
      grade,
      chapters,
    });
  } catch (error) {
    console.error("Get grade content error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// ============================
// Add chapter
// ============================

app.post("/content/:grade/chapters", async (req, res) => {
  try {
    const grade = req.params.grade;
    const {
      title,
      chapterOrder = 1,
    } = req.body;

    if (!["second", "third"].includes(grade)) {
      return res.status(400).json({
        message: "Invalid grade",
      });
    }

    if (!title) {
      return res.status(400).json({
        message: "Chapter title is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO chapters
        (
          grade,
          title,
          chapter_order
        )
      VALUES
        ($1, $2, $3)

      RETURNING *
      `,
      [
        grade,
        title,
        chapterOrder,
      ]
    );

    res.status(201).json(
      mapChapter(result.rows[0])
    );
  } catch (error) {
    console.error("Create chapter error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// ============================
// Edit chapter
// ============================

app.put(
  "/content/:grade/chapters/:chapterId",
  async (req, res) => {
    try {
      const {
        title,
        chapterOrder,
      } = req.body;

      const result = await pool.query(
        `
        UPDATE chapters

        SET
          title = COALESCE($1, title),
          chapter_order = COALESCE($2, chapter_order)

        WHERE id = $3
          AND grade = $4

        RETURNING *
        `,
        [
          title || null,
          chapterOrder ?? null,
          req.params.chapterId,
          req.params.grade,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Chapter not found",
        });
      }

      res.json(
        mapChapter(result.rows[0])
      );
    } catch (error) {
      console.error("Update chapter error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Delete chapter
// ============================

app.delete(
  "/content/:grade/chapters/:chapterId",
  async (req, res) => {
    try {
      const result = await pool.query(
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

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Chapter not found",
        });
      }

      res.json({
        message: "Chapter deleted",
      });
    } catch (error) {
      console.error("Delete chapter error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Add lesson
// ============================

app.post(
  "/content/:grade/chapters/:chapterId/lessons",
  async (req, res) => {
    try {
      const {
        title,
        description = "",
        videoUrl = "",
        lessonOrder = 1,
      } = req.body;

      if (!title) {
        return res.status(400).json({
          message: "Lesson title is required",
        });
      }

      const chapterResult = await pool.query(
        `
        SELECT id
        FROM chapters
        WHERE id = $1
          AND grade = $2
        `,
        [
          req.params.chapterId,
          req.params.grade,
        ]
      );

      if (chapterResult.rows.length === 0) {
        return res.status(404).json({
          message: "Chapter not found",
        });
      }

      const result = await pool.query(
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
          ($1, $2, $3, $4, $5)

        RETURNING *
        `,
        [
          req.params.chapterId,
          title,
          description,
          videoUrl,
          lessonOrder,
        ]
      );

      res.status(201).json(
        mapLesson(result.rows[0])
      );
    } catch (error) {
      console.error("Create lesson error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Get single lesson
// ============================

app.get(
  "/content/:grade/lessons/:lessonId",
  async (req, res) => {
    try {
      const lessonResult = await pool.query(
        `
        SELECT
          l.*,
          c.grade

        FROM lessons l

        JOIN chapters c
          ON c.id = l.chapter_id

        WHERE l.id = $1
          AND c.grade = $2
        `,
        [
          req.params.lessonId,
          req.params.grade,
        ]
      );

      if (lessonResult.rows.length === 0) {
        return res.status(404).json({
          message: "Lesson not found",
        });
      }

      const exercisesResult = await pool.query(
        `
        SELECT *
        FROM exercises

        WHERE lesson_id = $1

        ORDER BY exercise_order, id
        `,
        [req.params.lessonId]
      );

      const lesson = mapLesson(
        lessonResult.rows[0],
        exercisesResult.rows.map(mapExercise)
      );

      res.json({
        ...lesson,
        grade: lessonResult.rows[0].grade,
      });
    } catch (error) {
      console.error("Get lesson error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Edit lesson
// ============================

app.put(
  "/content/:grade/lessons/:lessonId",
  async (req, res) => {
    try {
      const {
        title,
        description,
        videoUrl,
        lessonOrder,
      } = req.body;

      const result = await pool.query(
        `
        UPDATE lessons l

        SET
          title = COALESCE($1, l.title),
          description = COALESCE($2, l.description),
          video_url = COALESCE($3, l.video_url),
          lesson_order = COALESCE($4, l.lesson_order)

        FROM chapters c

        WHERE l.id = $5
          AND c.id = l.chapter_id
          AND c.grade = $6

        RETURNING l.*
        `,
        [
          title || null,
          description ?? null,
          videoUrl ?? null,
          lessonOrder ?? null,
          req.params.lessonId,
          req.params.grade,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Lesson not found",
        });
      }

      res.json(
        mapLesson(result.rows[0])
      );
    } catch (error) {
      console.error("Update lesson error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Delete lesson
// ============================

app.delete(
  "/content/:grade/lessons/:lessonId",
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM lessons l
        USING chapters c

        WHERE l.id = $1
          AND c.id = l.chapter_id
          AND c.grade = $2

        RETURNING l.id
        `,
        [
          req.params.lessonId,
          req.params.grade,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Lesson not found",
        });
      }

      res.json({
        message: "Lesson deleted",
      });
    } catch (error) {
      console.error("Delete lesson error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Add exercise
// ============================

app.post(
  "/content/:grade/lessons/:lessonId/exercises",
  async (req, res) => {
    try {
      const {
        question,
        correctAnswer,
        exerciseOrder = 1,
      } = req.body;

      if (!question || !correctAnswer) {
        return res.status(400).json({
          message: "Question and correct answer are required",
        });
      }

      const lessonResult = await pool.query(
        `
        SELECT l.id

        FROM lessons l

        JOIN chapters c
          ON c.id = l.chapter_id

        WHERE l.id = $1
          AND c.grade = $2
        `,
        [
          req.params.lessonId,
          req.params.grade,
        ]
      );

      if (lessonResult.rows.length === 0) {
        return res.status(404).json({
          message: "Lesson not found",
        });
      }

      const result = await pool.query(
        `
        INSERT INTO exercises
          (
            lesson_id,
            question,
            correct_answer,
            exercise_order
          )

        VALUES
          ($1, $2, $3, $4)

        RETURNING *
        `,
        [
          req.params.lessonId,
          question,
          correctAnswer,
          exerciseOrder,
        ]
      );

      res.status(201).json(
        mapExercise(result.rows[0])
      );
    } catch (error) {
      console.error("Create exercise error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Edit exercise
// ============================

app.put(
  "/content/:grade/lessons/:lessonId/exercises/:exerciseId",
  async (req, res) => {
    try {
      const {
        question,
        correctAnswer,
        exerciseOrder,
      } = req.body;

      const result = await pool.query(
        `
        UPDATE exercises e

        SET
          question = COALESCE($1, e.question),
          correct_answer = COALESCE($2, e.correct_answer),
          exercise_order = COALESCE($3, e.exercise_order)

        FROM lessons l, chapters c

        WHERE e.id = $4
          AND e.lesson_id = $5
          AND l.id = e.lesson_id
          AND c.id = l.chapter_id
          AND c.grade = $6

        RETURNING e.*
        `,
        [
          question || null,
          correctAnswer || null,
          exerciseOrder ?? null,
          req.params.exerciseId,
          req.params.lessonId,
          req.params.grade,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Exercise not found",
        });
      }

      res.json(
        mapExercise(result.rows[0])
      );
    } catch (error) {
      console.error("Update exercise error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Delete exercise
// ============================

app.delete(
  "/content/:grade/lessons/:lessonId/exercises/:exerciseId",
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM exercises e
        USING lessons l, chapters c

        WHERE e.id = $1
          AND e.lesson_id = $2
          AND l.id = e.lesson_id
          AND c.id = l.chapter_id
          AND c.grade = $3

        RETURNING e.id
        `,
        [
          req.params.exerciseId,
          req.params.lessonId,
          req.params.grade,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Exercise not found",
        });
      }

      res.json({
        message: "Exercise deleted",
      });
    } catch (error) {
      console.error("Delete exercise error:", error);

      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
);

// ============================
// Start
// ============================

async function start() {
  try {
    await waitForDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`content-service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

start();
