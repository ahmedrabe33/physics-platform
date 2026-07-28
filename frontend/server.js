const express = require("express");
const session = require("express-session");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const GATEWAY = process.env.GATEWAY_URL || "http://localhost:8080";

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
  secret: process.env.SESSION_SECRET || "physics-frontend-secret",
  resave: false,
  saveUninitialized: false
}));

fs.mkdirSync("uploads", { recursive: true });
const upload = multer({ dest: "uploads/" });

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}
function requireStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== "student") return res.redirect("/");
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") return res.redirect("/");
  next();
}
async function getStudentAccess(userId) {
  return axios.get(`${GATEWAY}/api/students/students/${userId}/access`);
}
async function loadStudentState(user) {
  const [studentResponse, contentResponse, progressResponse] = await Promise.all([
    axios.get(`${GATEWAY}/api/students/students/${user.userId}`),
    axios.get(`${GATEWAY}/api/content/content/${user.grade}`),
    axios.get(`${GATEWAY}/api/progress/progress/${user.userId}`)
  ]);
  const student = studentResponse.data;
  const chapters = contentResponse.data.chapters || [];
  const progress = progressResponse.data || [];
  const lessons = [];
  [...chapters].sort((a,b)=>a.order-b.order).forEach(chapter => {
    [...chapter.lessons].sort((a,b)=>a.order-b.order).forEach(lesson => {
      lessons.push({...lesson, chapterId: chapter.id, chapterTitle: chapter.title});
    });
  });
  lessons.forEach((lesson, index) => {
    lesson.completed = progress.some(x => String(x.lessonId) === String(lesson.id) && x.completed === true);
    lesson.unlocked = index === 0 || progress.some(x => String(x.lessonId) === String(lessons[index-1].id) && x.completed === true);
  });
  const completedCount = lessons.filter(x => x.completed).length;
  const progressPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  return { student, chapters, progress, lessons, completedCount, totalLessons: lessons.length, progressPercent };
}

app.get("/", (req, res) => {
  if (req.session.user?.role === "admin") return res.redirect("/admin");
  if (req.session.user?.role === "student") return res.redirect("/dashboard");
  res.render("login", { error: null });
});
app.get("/forgot-password", (_, res) => res.render("forgot-password"));

app.post("/login", async (req, res) => {
  try {
    const { data } = await axios.post(`${GATEWAY}/api/auth/login`, {
      username: req.body.username,
      password: req.body.password
    });
    req.session.token = data.token;
    req.session.user = data.user;
    if (data.user.role === "admin") return res.redirect("/admin");
    try { await getStudentAccess(data.user.userId); }
    catch (error) {
      const status = error.response?.data?.status;
      if (status === "expired") return res.render("expired");
      if (status === "rejected") return res.render("rejected");
      return res.render("pending");
    }
    res.redirect("/dashboard");
  } catch (error) {
    res.render("login", { error: error.response?.data?.message || "Login failed" });
  }
});

app.get("/signup", (_, res) => res.render("signup", { error: null }));
app.post("/signup", upload.single("paymentProof"), async (req, res) => {
  const temp = req.file?.path;
  try {
    if (!req.file) return res.render("signup", { error: "يجب رفع صورة إثبات الدفع" });
    const { username, email, password, grade } = req.body;
    const auth = await axios.post(`${GATEWAY}/api/auth/register`, { username, email, password, grade });
    const form = new FormData();
    form.append("userId", String(auth.data.user.id));
    form.append("username", username);
    form.append("email", email);
    form.append("grade", grade);
    form.append("paymentProof", fs.createReadStream(temp), { filename: req.file.originalname });
    await axios.post(`${GATEWAY}/api/students/students`, form, { headers: form.getHeaders(), maxBodyLength: Infinity });
    res.render("pending");
  } catch (error) {
    res.render("signup", { error: error.response?.data?.message || "Registration failed" });
  } finally {
    if (temp && fs.existsSync(temp)) fs.unlinkSync(temp);
  }
});

app.get("/dashboard", requireStudent, async (req, res) => {
  try {
    try { await getStudentAccess(req.session.user.userId); }
    catch (error) {
      const status = error.response?.data?.status;
      if (status === "expired") return res.render("expired");
      if (status === "rejected") return res.render("rejected");
      return res.render("pending");
    }
    res.render("student-dashboard", { user: req.session.user, ...(await loadStudentState(req.session.user)) });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(502).send("Cannot load dashboard");
  }
});

app.get("/grade/:grade", requireStudent, async (req, res) => {
  try {
    if (req.session.user.grade !== req.params.grade) return res.status(403).send("غير مسموح");
    await getStudentAccess(req.session.user.userId);
    res.render("grade", { grade: req.params.grade, user: req.session.user, ...(await loadStudentState(req.session.user)) });
  } catch (error) {
    const status = error.response?.data?.status;
    if (status === "expired") return res.render("expired");
    if (status === "rejected") return res.render("rejected");
    res.status(502).send("Cannot load grade");
  }
});

app.get("/lesson/:grade/:lessonId", requireStudent, async (req, res) => {
  try {
    const { grade, lessonId } = req.params;
    if (req.session.user.grade !== grade) return res.status(403).send("غير مسموح");
    await getStudentAccess(req.session.user.userId);
    const state = await loadStudentState(req.session.user);
    const index = state.lessons.findIndex(x => String(x.id) === String(lessonId));
    if (index < 0) return res.status(404).send("الدرس غير موجود");
    await axios.post(`${GATEWAY}/api/progress/progress/check-access`, {
      userId: req.session.user.userId,
      lessonId: state.lessons[index].id,
      previousLessonId: index > 0 ? state.lessons[index-1].id : null
    });
    res.render("lesson", { lesson: state.lessons[index], grade, user: req.session.user, success: null, exerciseResult: null });
  } catch (error) {
    if (error.response?.status === 403) return res.status(403).send("🔒 يجب إنهاء الدرس السابق أولاً");
    res.status(502).send("Cannot load lesson");
  }
});

app.post("/lesson/:grade/:lessonId/exercise/:exerciseId/check", requireStudent, async (req, res) => {
  try {
    const { grade, lessonId, exerciseId } = req.params;
    const response = await axios.get(`${GATEWAY}/api/content/content/${grade}/lessons/${lessonId}`);
    const lesson = response.data.lesson;
    const exercise = lesson.exercises.find(x => String(x.id) === String(exerciseId));
    if (!exercise) return res.status(404).send("السؤال غير موجود");
    const submitted = String(req.body.answer || "").trim().toLowerCase();
    const correct = String(exercise.correctAnswer || "").trim().toLowerCase();
    res.render("lesson", {
      lesson, grade, user: req.session.user, success: null,
      exerciseResult: { exerciseId, correct: submitted === correct, correctAnswer: exercise.correctAnswer }
    });
  } catch (error) { res.status(502).send("Cannot check answer"); }
});

app.post("/lesson/:grade/:lessonId/complete", requireStudent, async (req, res) => {
  try {
    const { grade, lessonId } = req.params;
    const response = await axios.get(`${GATEWAY}/api/content/content/${grade}/lessons/${lessonId}`);
    await axios.post(`${GATEWAY}/api/progress/progress/complete`, {
      userId: req.session.user.userId, grade,
      chapterId: response.data.chapterId,
      lessonId: response.data.lesson.id,
      score: 100
    });
    res.render("lesson", { lesson: response.data.lesson, grade, user: req.session.user, success: "تم إنهاء الدرس بنجاح ✅ والدرس التالي أصبح متاحاً.", exerciseResult: null });
  } catch (error) { res.status(502).send("Cannot complete lesson"); }
});

app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [studentsResponse, contentResponse] = await Promise.all([
      axios.get(`${GATEWAY}/api/students/students`),
      axios.get(`${GATEWAY}/api/content/content`)
    ]);
    const students = studentsResponse.data;
    const content = contentResponse.data;
    const chaptersCount = content.second.chapters.length + content.third.chapters.length;
    const lessonsCount = ["second","third"].reduce((sum, grade) => sum + content[grade].chapters.reduce((s,c)=>s+c.lessons.length,0),0);
    const stats = {
      totalStudents: students.length,
      pendingStudents: students.filter(x=>x.status==="pending").length,
      approvedStudents: students.filter(x=>x.status==="approved").length,
      expiredStudents: students.filter(x=>x.status==="expired").length,
      chaptersCount, lessonsCount
    };
    res.render("admin", { students, user: req.session.user, stats });
  } catch (error) { res.status(502).send("Cannot load admin dashboard"); }
});

app.post("/admin/approve/:userId", requireAdmin, async (req,res)=>{ await axios.post(`${GATEWAY}/api/students/students/${req.params.userId}/approve`); res.redirect("/admin"); });
app.post("/admin/reject/:userId", requireAdmin, async (req,res)=>{ await axios.post(`${GATEWAY}/api/students/students/${req.params.userId}/reject`); res.redirect("/admin"); });
app.post("/admin/renew/:userId", requireAdmin, async (req,res)=>{ await axios.post(`${GATEWAY}/api/students/students/${req.params.userId}/renew`); res.redirect("/admin"); });

app.get("/admin/content", requireAdmin, async (req,res)=>{
  const response = await axios.get(`${GATEWAY}/api/content/content`);
  res.render("admin-content", { content: response.data, user: req.session.user });
});
app.post("/admin/content/chapter", requireAdmin, async (req,res)=>{ await axios.post(`${GATEWAY}/api/content/content/${req.body.grade}/chapters`, {title:req.body.title}); res.redirect("/admin/content"); });
app.post("/admin/content/chapter/:grade/:chapterId/edit", requireAdmin, async (req,res)=>{ await axios.put(`${GATEWAY}/api/content/content/${req.params.grade}/chapters/${req.params.chapterId}`, {title:req.body.title}); res.redirect("/admin/content"); });
app.post("/admin/content/chapter/:grade/:chapterId/delete", requireAdmin, async (req,res)=>{ await axios.delete(`${GATEWAY}/api/content/content/${req.params.grade}/chapters/${req.params.chapterId}`); res.redirect("/admin/content"); });
app.post("/admin/content/lesson", requireAdmin, async (req,res)=>{ const {grade,chapterId,title,description,videoUrl}=req.body; await axios.post(`${GATEWAY}/api/content/content/${grade}/chapters/${chapterId}/lessons`, {title,description,videoUrl}); res.redirect("/admin/content"); });
app.post("/admin/content/lesson/:grade/:lessonId/edit", requireAdmin, async (req,res)=>{ await axios.put(`${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}`, {title:req.body.title,description:req.body.description,videoUrl:req.body.videoUrl}); res.redirect("/admin/content"); });
app.post("/admin/content/lesson/:grade/:lessonId/delete", requireAdmin, async (req,res)=>{ await axios.delete(`${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}`); res.redirect("/admin/content"); });
app.post("/admin/content/exercise", requireAdmin, async (req,res)=>{ const {grade,lessonId,question,correctAnswer}=req.body; await axios.post(`${GATEWAY}/api/content/content/${grade}/lessons/${lessonId}/exercises`, {question,correctAnswer}); res.redirect("/admin/content"); });
app.post("/admin/content/exercise/:grade/:lessonId/:exerciseId/edit", requireAdmin, async (req,res)=>{ await axios.put(`${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}/exercises/${req.params.exerciseId}`, {question:req.body.question,correctAnswer:req.body.correctAnswer}); res.redirect("/admin/content"); });
app.post("/admin/content/exercise/:grade/:lessonId/:exerciseId/delete", requireAdmin, async (req,res)=>{ await axios.delete(`${GATEWAY}/api/content/content/${req.params.grade}/lessons/${req.params.lessonId}/exercises/${req.params.exerciseId}`); res.redirect("/admin/content"); });

app.post("/logout", (req,res)=>req.session.destroy(()=>res.redirect("/")));
app.get("/health", (_,res)=>res.json({service:"frontend",status:"healthy"}));
app.listen(PORT,"0.0.0.0",()=>console.log(`frontend running on port ${PORT}`));
