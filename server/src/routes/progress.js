import { Router } from 'express';
import { query, one } from '../db.js';
import { httpError } from '../files.js';
import { topicMastery, readinessOf } from '../mastery.js';

const router = Router();

router.get('/courses/:id/progress', async (req, res) => {
  const course = await one('SELECT id, code, name FROM courses WHERE id = $1', [req.params.id]);
  if (!course) throw httpError(404, 'Course not found');

  const topics = await topicMastery(course.id);
  const lectures = await query(`
    SELECT l.id, l.number, l.title,
      COUNT(t.id)::int AS topic_count,
      COUNT(t.id) FILTER (WHERE t.completed)::int AS topics_done,
      (SELECT ROUND(AVG(z.score)) FROM quizzes z
        WHERE z.lecture_id = l.id AND z.completed_at IS NOT NULL) AS avg_quiz_score
    FROM lectures l LEFT JOIN topics t ON t.lecture_id = l.id
    WHERE l.course_id = $1 GROUP BY l.id ORDER BY l.number`, [course.id]);
  const quizzes = await query(`
    SELECT id, title, kind, score, completed_at FROM quizzes
    WHERE course_id = $1 AND completed_at IS NOT NULL ORDER BY completed_at`, [course.id]);

  res.json({
    course,
    readiness: readinessOf(topics),
    lectures: lectures.map((l) => ({ ...l, avg_quiz_score: l.avg_quiz_score === null ? null : Number(l.avg_quiz_score) })),
    quizzes: quizzes.map((q) => ({ ...q, score: Number(q.score) })),
    topics,
    strong: topics.filter((t) => t.level === 'strong'),
    weak: topics.filter((t) => t.level === 'weak'),
    untested: topics.filter((t) => t.level === 'untested'),
  });
});

// Everything the dashboard needs in one call
router.get('/dashboard', async (_req, res) => {
  const courses = await query('SELECT id, code, name, term FROM courses ORDER BY code');
  const out = [];
  for (const c of courses) {
    const topics = await topicMastery(c.id);
    const next = topics.find((t) => !t.completed) ?? null;
    out.push({
      ...c,
      readiness: readinessOf(topics),
      topic_count: topics.length,
      topics_done: topics.filter((t) => t.completed).length,
      weak: topics.filter((t) => t.level === 'weak').slice(0, 3),
      next,
    });
  }
  const recent = await query(`
    SELECT z.id, z.title, z.score, z.completed_at FROM quizzes z
    WHERE z.completed_at IS NOT NULL ORDER BY z.completed_at DESC LIMIT 5`);
  res.json({ courses: out, recentQuizzes: recent.map((q) => ({ ...q, score: Number(q.score) })) });
});

export default router;
