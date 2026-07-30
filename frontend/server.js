const express = require("express");
const session = require("express-session");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const GATEWAY =
  process.env.GATEWAY_URL ||
  "http://localhost:8080";


// ======================================================
// Express
// ======================================================

app.set("view engine", "ejs");

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(express.json());

app.use(
  express.static("public")
);

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "physics-frontend-secret",

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
    },
  })
);


// ======================================================
// Uploads
// ======================================================

fs.mkdirSync(
  "uploads",
  {
    recursive: true,
  }
);

const upload =
  multer({
    dest: "uploads/",
  });


// ======================================================
// Middleware
// ======================================================

function requireLogin(
  req,
  res,
  next
) {
  if (!req.session.user) {
    return res.redirect("/");
  }

  next();
}


function requireStudent(
  req,
  res,
  next
) {
  if (
    !req.session.user ||
    req.session.user.role !==
      "student"
  ) {
    return res.redirect("/");
  }

  next();
}


function requireAdmin(
  req,
  res,
  next
) {
  if (
    !req.session.user ||
    req.session.user.role !==
      "admin"
  ) {
    return res.redirect("/");
  }

  next();
}


// ======================================================
// Student helpers
// ======================================================

async function getStudentAccess(
  userId
) {
  return axios.get(
    `${GATEWAY}/api/students/students/${userId}/access`
  );
}


async function loadStudentState(
  user
) {
  const [
    studentResponse,
    contentResponse,
    progressResponse,
  ] = await Promise.all([
    axios.get(
      `${GATEWAY}/api/students/students/${user.userId}`
    ),

    axios.get(
      `${GATEWAY}/api/content/content/${user.grade}`
    ),

    axios.get(
      `${GATEWAY}/api/progress/progress/${user.userId}`
    ),
  ]);


  const student =
    studentResponse.data;

  const chapters =
    contentResponse.data
      .chapters || [];

  const progress =
    progressResponse.data || [];

  const lessons = [];


  [...chapters]
    .sort(
      (a, b) =>
        (
          a.chapterOrder ??
          a.order ??
          0
        ) -
        (
          b.chapterOrder ??
          b.order ??
          0
        )
    )
    .forEach(
      (chapter) => {

        [
          ...(chapter.lessons || []),
        ]
          .sort(
            (a, b) =>
              (
                a.lessonOrder ??
                a.order ??
                0
              ) -
              (
                b.lessonOrder ??
                b.order ??
                0
              )
          )
          .forEach(
            (lesson) => {

              lessons.push({
                ...lesson,

                chapterId:
                  chapter.id,

                chapterTitle:
                  chapter.title,
              });

            }
          );

      }
    );


  lessons.forEach(
    (lesson, index) => {

      lesson.completed =
        progress.some(
          (item) =>
            String(
              item.lessonId
            ) ===
              String(
                lesson.id
              ) &&
            item.completed ===
              true
        );


      lesson.unlocked =
        index === 0 ||
        lesson.completed ||
        progress.some(
          (item) =>
            String(
              item.lessonId
            ) ===
              String(
                lessons[
                  index - 1
                ].id
              ) &&
            item.completed ===
              true
        );

    }
  );


  const completedCount =
    lessons.filter(
      (lesson) =>
        lesson.completed
    ).length;


  const progressPercent =
    lessons.length
      ? Math.round(
          (
            completedCount /
            lessons.length
          ) * 100
        )
      : 0;


  const continueLesson =
    lessons.find(
      (lesson) =>
        lesson.unlocked &&
        !lesson.completed
    ) ||
    lessons
      .filter(
        (lesson) =>
          lesson.completed
      )
      .at(-1) ||
    null;


  const allLessonsCompleted =
    lessons.length > 0 &&
    completedCount ===
      lessons.length;


  return {
    student,
    chapters,
    progress,
    lessons,
    completedCount,

    totalLessons:
      lessons.length,

    progressPercent,

    continueLesson,

    allLessonsCompleted,
  };
}


// ======================================================
// Home
// ======================================================

app.get(
  "/",

  (req, res) => {

    if (
      req.session.user?.role ===
      "admin"
    ) {
      return res.redirect(
        "/admin"
      );
    }


    if (
      req.session.user?.role ===
      "student"
    ) {
      return res.redirect(
        "/dashboard"
      );
    }


    res.render(
      "login",
      {
        error: null,
      }
    );

  }
);


// ======================================================
// Forgot password
// ======================================================

app.get(
  "/forgot-password",

  (req, res) => {

    res.render(
      "forgot-password"
    );

  }
);


// ======================================================
// Login
// ======================================================

app.post(
  "/login",

  async (req, res) => {

    try {

      const { data } =
        await axios.post(
          `${GATEWAY}/api/auth/login`,
          {
            username:
              req.body.username,

            password:
              req.body.password,
          }
        );


      req.session.token =
        data.token;

      req.session.user =
        data.user;


      if (
        data.user.role ===
        "admin"
      ) {
        return res.redirect(
          "/admin"
        );
      }


      try {

        await getStudentAccess(
          data.user.userId
        );

      } catch (error) {

        const status =
          error.response?.data
            ?.status;


        if (
          status === "expired"
        ) {
          return res.render(
            "expired"
          );
        }


        if (
          status === "rejected"
        ) {
          return res.render(
            "rejected"
          );
        }


        return res.render(
          "pending"
        );

      }


      res.redirect(
        "/dashboard"
      );

    } catch (error) {

      console.error(
        "Login error:",
        error.response?.data ||
          error.message
      );


      res.render(
        "login",
        {
          error:
            error.response?.data
              ?.message ||
            "Login failed",
        }
      );

    }

  }
);


// ======================================================
// Signup
// ======================================================

app.get(
  "/signup",

  (req, res) => {

    res.render(
      "signup",
      {
        error: null,
      }
    );

  }
);


app.post(
  "/signup",

  upload.single(
    "paymentProof"
  ),

  async (req, res) => {

    const temp =
      req.file?.path;


    try {

      if (!req.file) {

        return res.render(
          "signup",
          {
            error:
              "يجب رفع صورة إثبات الدفع",
          }
        );

      }


      const {
        username,
        email,
        password,
        grade,
      } = req.body;


      const auth =
        await axios.post(
          `${GATEWAY}/api/auth/register`,
          {
            username,
            email,
            password,
            grade,
          }
        );


      const form =
        new FormData();


      form.append(
        "userId",
        String(
          auth.data.user.id
        )
      );

      form.append(
        "username",
        username
      );

      form.append(
        "email",
        email
      );

      form.append(
        "grade",
        grade
      );

      form.append(
        "paymentProof",
        fs.createReadStream(
          temp
        ),
        {
          filename:
            req.file.originalname,
        }
      );


      await axios.post(
        `${GATEWAY}/api/students/students`,
        form,
        {
          headers:
            form.getHeaders(),

          maxBodyLength:
            Infinity,
        }
      );


      res.render(
        "pending"
      );

    } catch (error) {

      console.error(
        "Signup error:",
        error.response?.data ||
          error.message
      );


      res.render(
        "signup",
        {
          error:
            error.response?.data
              ?.message ||
            "Registration failed",
        }
      );

    } finally {

      if (
        temp &&
        fs.existsSync(temp)
      ) {
        fs.unlinkSync(temp);
      }

    }

  }
);


// ======================================================
// Student dashboard
// ======================================================

app.get(
  "/dashboard",

  requireStudent,

  async (req, res) => {

    try {

      try {

        await getStudentAccess(
          req.session.user.userId
        );

      } catch (error) {

        const status =
          error.response?.data
            ?.status;


        if (
          status === "expired"
        ) {
          return res.render(
            "expired"
          );
        }


        if (
          status === "rejected"
        ) {
          return res.render(
            "rejected"
          );
        }


        return res.render(
          "pending"
        );

      }


      const state =
        await loadStudentState(
          req.session.user
        );


      res.render(
        "student-dashboard",
        {
          user:
            req.session.user,

          ...state,
        }
      );

    } catch (error) {

      console.error(
        "Dashboard error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot load dashboard"
        );

    }

  }
);


// ======================================================
// Grade
// ======================================================

app.get(
  "/grade/:grade",

  requireStudent,

  async (req, res) => {

    try {

      if (
        req.session.user.grade !==
        req.params.grade
      ) {
        return res
          .status(403)
          .send(
            "غير مسموح"
          );
      }


      await getStudentAccess(
        req.session.user.userId
      );


      const state =
        await loadStudentState(
          req.session.user
        );


      res.render(
        "grade",
        {
          grade:
            req.params.grade,

          user:
            req.session.user,

          ...state,
        }
      );

    } catch (error) {

      const status =
        error.response?.data
          ?.status;


      if (
        status === "expired"
      ) {
        return res.render(
          "expired"
        );
      }


      if (
        status === "rejected"
      ) {
        return res.render(
          "rejected"
        );
      }


      console.error(
        "Grade error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot load grade"
        );

    }

  }
);


// ======================================================
// Open lesson
// ======================================================

app.get(
  "/lesson/:grade/:lessonId",

  requireStudent,

  async (req, res) => {

    try {

      const {
        grade,
        lessonId,
      } = req.params;


      if (
        req.session.user.grade !==
        grade
      ) {
        return res
          .status(403)
          .send(
            "غير مسموح"
          );
      }


      await getStudentAccess(
        req.session.user.userId
      );


      const state =
        await loadStudentState(
          req.session.user
        );


      const index =
        state.lessons.findIndex(
          (lesson) =>
            String(
              lesson.id
            ) ===
            String(
              lessonId
            )
        );


      if (index < 0) {

        return res
          .status(404)
          .send(
            "الدرس غير موجود"
          );

      }


      const currentLesson =
        state.lessons[index];


      if (
        !currentLesson.completed
      ) {

        await axios.post(
          `${GATEWAY}/api/progress/progress/check-access`,
          {
            userId:
              req.session.user
                .userId,

            lessonId:
              currentLesson.id,

            previousLessonId:
              index > 0
                ? state.lessons[
                    index - 1
                  ].id
                : null,
          }
        );

      }


      res.render(
        "lesson",
        {
          lesson:
            currentLesson,

          grade,

          user:
            req.session.user,

          success: null,

          exerciseResult:
            null,
        }
      );

    } catch (error) {

      if (
        error.response?.status ===
        403
      ) {
        return res.redirect(
          `/grade/${req.params.grade}?locked=1`
        );
      }


      console.error(
        "Load lesson error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot load lesson"
        );

    }

  }
);


// ======================================================
// Check exercise
// ======================================================

app.post(
  "/lesson/:grade/:lessonId/exercise/:exerciseId/check",

  requireStudent,

  async (req, res) => {

    try {

      const {
        grade,
        lessonId,
        exerciseId,
      } = req.params;


      const response =
        await axios.get(
          `${GATEWAY}/api/content/content/${grade}/lessons/${lessonId}`
        );


      const lesson =
        response.data;


      const exercise =
        (
          lesson.exercises ||
          []
        ).find(
          (item) =>
            String(
              item.id
            ) ===
            String(
              exerciseId
            )
        );


      if (!exercise) {

        return res
          .status(404)
          .send(
            "السؤال غير موجود"
          );

      }


      const submitted =
        String(
          req.body.answer ||
            ""
        )
          .trim()
          .toLowerCase();


      const correct =
        String(
          exercise.correctAnswer ||
            ""
        )
          .trim()
          .toLowerCase();


      res.render(
        "lesson",
        {
          lesson,

          grade,

          user:
            req.session.user,

          success:
            null,

          exerciseResult: {
            exerciseId,

            correct:
              submitted ===
              correct,

            correctAnswer:
              exercise.correctAnswer,
          },
        }
      );

    } catch (error) {

      console.error(
        "Check exercise error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot check answer"
        );

    }

  }
);


// ======================================================
// Complete lesson
// ======================================================

app.post(
  "/lesson/:grade/:lessonId/complete",

  requireStudent,

  async (req, res) => {

    try {

      const {
        grade,
        lessonId,
      } = req.params;


      const response =
        await axios.get(
          `${GATEWAY}/api/content/content/${grade}/lessons/${lessonId}`
        );


      const lesson =
        response.data;


      await axios.post(
        `${GATEWAY}/api/progress/progress/complete`,
        {
          userId:
            req.session.user
              .userId,

          lessonId:
            lesson.id,

          score:
            100,
        }
      );


      return res.redirect(
        "/dashboard?completed=1"
      );

    } catch (error) {

      console.error(
        "Complete lesson error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot complete lesson"
        );

    }

  }
);


// ======================================================
// Track video view
// ======================================================

app.post(
  "/track-video-view",

  requireStudent,

  async (req, res) => {

    try {

      const {
        lessonId,
        videoUrl,
        topicId,
      } = req.body;


      if (!lessonId) {

        return res
          .status(400)
          .json({
            success: false,

            message:
              "lessonId is required",
          });

      }


      await getStudentAccess(
        req.session.user.userId
      );


      await axios.post(
        `${GATEWAY}/api/progress/progress/video-view`,
        {
          userId:
            req.session.user
              .userId,

          lessonId,

          topicId:
            topicId || null,

          videoUrl:
            videoUrl || null,
        }
      );


      res.json({
        success: true,
      });

    } catch (error) {

      console.error(
        "Track video view error:",
        error.response?.data ||
          error.message
      );


      res
        .status(
          error.response?.status ||
            500
        )
        .json({
          success: false,

          message:
            error.response?.data
              ?.message ||
            "Cannot track video view",
        });

    }

  }
);


// ======================================================
// Admin dashboard
// ======================================================

app.get(
  "/admin",

  requireAdmin,

  async (req, res) => {

    try {

      const [
        studentsResponse,
        contentResponse,
        videoViewsResponse,
      ] = await Promise.all([

        axios.get(
          `${GATEWAY}/api/students/students`
        ),

        axios.get(
          `${GATEWAY}/api/content/content`
        ),

        axios.get(
          `${GATEWAY}/api/progress/progress/admin/video-views`
        ),

      ]);


      const students =
        studentsResponse.data;

      const content =
        contentResponse.data;

      const videoViews =
        Array.isArray(
          videoViewsResponse.data
        )
          ? videoViewsResponse.data
          : [];


      const chaptersCount =
        (
          content.second
            ?.chapters ||
          []
        ).length +
        (
          content.third
            ?.chapters ||
          []
        ).length;


      const lessonsCount =
        [
          "second",
          "third",
        ].reduce(
          (
            total,
            grade
          ) => {

            return (
              total +
              (
                content[
                  grade
                ]?.chapters ||
                []
              ).reduce(
                (
                  sum,
                  chapter
                ) =>
                  sum +
                  (
                    chapter.lessons ||
                    []
                  ).length,

                0
              )
            );

          },

          0
        );


      const stats = {

        totalStudents:
          students.length,

        pendingStudents:
          students.filter(
            (student) =>
              student.status ===
              "pending"
          ).length,

        approvedStudents:
          students.filter(
            (student) =>
              student.status ===
              "approved"
          ).length,

        expiredStudents:
          students.filter(
            (student) =>
              student.status ===
              "expired"
          ).length,

        chaptersCount,

        lessonsCount,

        videoViewsCount:
          videoViews.length,
      };


      res.render(
        "admin",
        {
          students,

          user:
            req.session.user,

          stats,

          videoViews,
        }
      );

    } catch (error) {

      console.error(
        "Admin dashboard error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot load admin dashboard"
        );

    }

  }
);


// ======================================================
// Admin student actions
// ======================================================

app.post(
  "/admin/approve/:userId",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.post(
        `${GATEWAY}/api/students/students/${req.params.userId}/approve`
      );


      res.redirect(
        "/admin"
      );

    } catch (error) {

      console.error(
        "Approve student error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot approve student"
        );

    }

  }
);


app.post(
  "/admin/reject/:userId",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.post(
        `${GATEWAY}/api/students/students/${req.params.userId}/reject`
      );


      res.redirect(
        "/admin"
      );

    } catch (error) {

      console.error(
        "Reject student error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot reject student"
        );

    }

  }
);


app.post(
  "/admin/renew/:userId",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.post(
        `${GATEWAY}/api/students/students/${req.params.userId}/renew`
      );


      res.redirect(
        "/admin"
      );

    } catch (error) {

      console.error(
        "Renew student error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot renew student"
        );

    }

  }
);


// ======================================================
// Admin content page
// ======================================================

app.get(
  "/admin/content",

  requireAdmin,

  async (req, res) => {

    try {

      const response =
        await axios.get(
          `${GATEWAY}/api/content/content`
        );


      res.render(
        "admin-content",
        {
          content:
            response.data,

          user:
            req.session.user,
        }
      );

    } catch (error) {

      console.error(
        "Admin content error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot load content management"
        );

    }

  }
);


// ======================================================
// Chapter CRUD
// ======================================================

app.post(
  "/admin/content/chapter",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.post(
        `${GATEWAY}/api/content/content/${req.body.grade}/chapters`,
        {
          title:
            req.body.title,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Create chapter error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot create chapter"
        );

    }

  }
);


app.post(
  "/admin/content/chapter/:grade/:chapterId/edit",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.put(
        `${GATEWAY}/api/content/content/${req.params.grade}/chapters/${req.params.chapterId}`,
        {
          title:
            req.body.title,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Edit chapter error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot edit chapter"
        );

    }

  }
);


app.post(
  "/admin/content/chapter/:grade/:chapterId/delete",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.delete(
        `${GATEWAY}/api/content/content/${req.params.grade}/chapters/${req.params.chapterId}`
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Delete chapter error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot delete chapter"
        );

    }

  }
);


// ======================================================
// Lesson CRUD
// ======================================================

app.post(
  "/admin/content/lesson",

  requireAdmin,

  async (req, res) => {

    try {

      const {
        grade,
        chapterId,
        title,
        description,
        videoUrl,
      } = req.body;


      await axios.post(
        `${GATEWAY}/api/content/content/${grade}/chapters/${chapterId}/lessons`,
        {
          title,
          description,
          videoUrl,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Create lesson error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot create lesson"
        );

    }

  }
);


app.post(
  "/admin/content/lesson/:grade/:lessonId/edit",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.put(
        `${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}`,
        {
          title:
            req.body.title,

          description:
            req.body.description,

          videoUrl:
            req.body.videoUrl,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Edit lesson error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot edit lesson"
        );

    }

  }
);


app.post(
  "/admin/content/lesson/:grade/:lessonId/delete",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.delete(
        `${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}`
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Delete lesson error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot delete lesson"
        );

    }

  }
);


// ======================================================
// Topic CRUD
// ======================================================

app.post(
  "/admin/content/topic",

  requireAdmin,

  async (req, res) => {

    try {

      const {
        grade,
        lessonId,
        title,
        description,
        videoUrl,
      } = req.body;


      await axios.post(
        `${GATEWAY}/api/content/content/${grade}/lessons/${lessonId}/topics`,
        {
          title,
          description,
          videoUrl,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Create topic error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot create topic"
        );

    }

  }
);


app.post(
  "/admin/content/topic/:grade/:lessonId/:topicId/edit",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.put(
        `${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}/topics/${req.params.topicId}`,
        {
          title:
            req.body.title,

          description:
            req.body.description,

          videoUrl:
            req.body.videoUrl,

          topicOrder:
            req.body.topicOrder
              ? Number(
                  req.body.topicOrder
                )
              : undefined,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Edit topic error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot edit topic"
        );

    }

  }
);


app.post(
  "/admin/content/topic/:grade/:lessonId/:topicId/delete",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.delete(
        `${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}/topics/${req.params.topicId}`
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Delete topic error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot delete topic"
        );

    }

  }
);


// ======================================================
// Exercise CRUD
// ======================================================

app.post(
  "/admin/content/exercise",

  requireAdmin,

  async (req, res) => {

    try {

      const {
        grade,
        lessonId,
        question,
        correctAnswer,
      } = req.body;


      await axios.post(
        `${GATEWAY}/api/content/content/${grade}/lessons/${lessonId}/exercises`,
        {
          question,
          correctAnswer,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Create exercise error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot create exercise"
        );

    }

  }
);


app.post(
  "/admin/content/exercise/:grade/:lessonId/:exerciseId/edit",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.put(
        `${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}/exercises/${req.params.exerciseId}`,
        {
          question:
            req.body.question,

          correctAnswer:
            req.body.correctAnswer,
        }
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Edit exercise error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot edit exercise"
        );

    }

  }
);


app.post(
  "/admin/content/exercise/:grade/:lessonId/:exerciseId/delete",

  requireAdmin,

  async (req, res) => {

    try {

      await axios.delete(
        `${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}/exercises/${req.params.exerciseId}`
      );


      res.redirect(
        "/admin/content"
      );

    } catch (error) {

      console.error(
        "Delete exercise error:",
        error.response?.data ||
          error.message
      );


      res
        .status(502)
        .send(
          "Cannot delete exercise"
        );

    }

  }
);


// ======================================================
// Logout
// ======================================================

app.post(
  "/logout",

  (req, res) => {

    req.session.destroy(
      () => {
        res.redirect("/");
      }
    );

  }
);


// ======================================================
// Health
// ======================================================

app.get(
  "/health",

  (req, res) => {

    res.json({
      service:
        "frontend",

      status:
        "healthy",
    });

  }
);


// ======================================================
// Start
// ======================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `frontend running on port ${PORT}`
    );

  }
);
