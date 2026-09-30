import { Router } from 'express';
import { query, one, pool } from '../db.js';
import { uploadPdf, removeFile, httpError } from '../files.js';
import { analyzeSyllabus } from '../claude.js';
import { topicMastery, readinessOf } from '../mastery.js';

const router = Router();

// List courses with a few numbers for the dashboard
router.get('/courses', async (_req, res) => {
  const courses = await query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM lectures l WHERE l.course_id = c.id)::int AS lecture_count,
      (SELECT COUNT(*) FROM topics t WHERE t.course_id = c.id)::int AS topic_count,
      (SELECT COUNT(*) FROM topics t WHERE t.course_id = c.id AND t.completed)::int AS topics_done,
      (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id)::int AS question_count
    FROM courses c ORDER BY c.code`);
  for (const c of courses) c.readiness = readinessOf(await topicMastery(c.id));
  res.json(courses);
});

router.post('/courses', async (req, res) => {
  const { code, name, term } = req.body ?? {};
  if (!code?.trim() || !name?.trim()) throw httpError(400, 'Course code and name are required');
  const course = await one(
    'INSERT INTO courses (code, name, term) VALUES ($1, $2, $3) RETURNING *',
    [code.trim().toUpperCase(), name.trim(), term?.trim() || null],
  );
  res.status(201).json(course);
});

router.get('/courses/:id', async (req, res) => {
  const course = await one('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!course) throw httpError(404, 'Course not found');
  course.syllabus = await query('SELECT * FROM syllabus_items WHERE course_id = $1 ORDER BY week, id', [course.id]);
  course.lectures = await query(`
    SELECT l.id, l.number, l.title, l.status, l.error, l.summary, l.created_at,
      (SELECT COUNT(*) FROM topics t WHERE t.lecture_id = l.id)::int AS topic_count,
      (SELECT COUNT(*) FROM topics t WHERE t.lecture_id = l.id AND t.completed)::int AS topics_done
    FROM lectures l WHERE l.course_id = $1 ORDER BY l.number`, [course.id]);
  res.json(course);
});

router.patch('/courses/:id', async (req, res) => {
  const { code, name, term } = req.body ?? {};
  const course = await one(
    `UPDATE courses SET code = COALESCE($2, code), name = COALESCE($3, name), term = COALESCE($4, term)
     WHERE id = $1 RETURNING *`,
    [req.params.id, code?.toUpperCase() ?? null, name ?? null, term ?? null],
  );
  if (!course) throw httpError(404, 'Course not found');
  res.json(course);
});

router.delete('/courses/:id', async (req, res) => {
  const files = await query(
    `SELECT file_path AS p FROM lectures WHERE course_id = $1
     UNION ALL SELECT syllabus_path FROM courses WHERE id = $1`, [req.params.id]);
  await query('DELETE FROM courses WHERE id = $1', [req.params.id]);
  files.forEach((f) => removeFile(f.p));
  res.status(204).end();
});

// Upload (or replace) the syllabus; Claude extracts the week-by-week plan
router.post('/courses/:id/syllabus', uploadPdf, async (req, res) => {
  if (!req.file) throw httpError(400, 'Attach the syllabus as a PDF');
  const course = await one('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!course) { removeFile(req.file.path); throw httpError(404, 'Course not found'); }

  let result;
  try {
    result = await analyzeSyllabus(req.file.path, course);
  } catch (err) {
    removeFile(req.file.path);
    throw err;
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('DELETE FROM syllabus_items WHERE course_id = $1', [course.id]);
    for (const item of result.items) {
      await db.query(
        'INSERT INTO syllabus_items (course_id, week, title, details) VALUES ($1, $2, $3, $4)',
        [course.id, item.week ?? null, item.title, item.details ?? null],
      );
    }
    await db.query('UPDATE courses SET syllabus_path = $2, syllabus_summary = $3 WHERE id = $1',
      [course.id, req.file.path, result.summary]);
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    removeFile(req.file.path);
    throw err;
  } finally {
    db.release();
  }
  removeFile(course.syllabus_path); // old syllabus, if any

  res.json({ summary: result.summary, items: result.items.length });
});

export default router;
