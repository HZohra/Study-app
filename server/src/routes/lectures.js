import { Router } from 'express';
import { query, one, pool } from '../db.js';
import { uploadPdf, removeFile, httpError } from '../files.js';
import { detectTopics, writeLesson } from '../claude.js';

const router = Router();

// Describes all courses (syllabus weeks + topics from processed lectures)
// so Claude can say where a topic appears in other classes.
async function coursesContext(excludeLectureId) {
  const courses = await query('SELECT id, code, name FROM courses ORDER BY code');
  const parts = [];
  for (const c of courses) {
    const weeks = await query('SELECT week, title FROM syllabus_items WHERE course_id = $1 ORDER BY week', [c.id]);
    const lectures = await query(`
      SELECT l.number, string_agg(t.title, '; ' ORDER BY t.position) AS topics
      FROM lectures l JOIN topics t ON t.lecture_id = l.id
      WHERE l.course_id = $1 AND l.id <> $2
      GROUP BY l.number ORDER BY l.number`, [c.id, excludeLectureId]);
    let text = `${c.code} ${c.name}`;
    if (weeks.length) text += `\n  Syllabus: ${weeks.map((w) => `Week ${w.week}: ${w.title}`).join(' | ')}`;
    if (lectures.length) text += `\n  Already taught: ${lectures.map((l) => `Lecture ${l.number}: ${l.topics}`).join(' | ')}`;
    parts.push(text);
  }
  return parts.join('\n');
}

// Reads the lecture PDF with Claude and saves its topics.
// Runs in the background; the page polls the lecture status.
async function processLecture(lectureId) {
  const lecture = await one('SELECT * FROM lectures WHERE id = $1', [lectureId]);
  const course = await one('SELECT * FROM courses WHERE id = $1', [lecture.course_id]);
  await query("UPDATE lectures SET status = 'processing', error = NULL WHERE id = $1", [lectureId]);

  try {
    const result = await detectTopics(lecture.file_path, lecture, course, await coursesContext(lectureId));
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('DELETE FROM topics WHERE lecture_id = $1', [lectureId]);
      let position = 1;
      for (const t of result.topics) {
        await db.query(
          `INSERT INTO topics (lecture_id, course_id, position, title, summary, slides, beyond, related)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [lectureId, course.id, position++, t.title, t.summary, t.slides,
            JSON.stringify(t.beyond ?? []), JSON.stringify(t.related ?? [])],
        );
      }
      await db.query(
        `UPDATE lectures SET status = 'ready', summary = $2,
           title = CASE WHEN title = '' OR title LIKE 'Lecture %' THEN $3 ELSE title END
         WHERE id = $1`,
        [lectureId, result.lecture_summary, result.lecture_title],
      );
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
  } catch (err) {
    console.error(`Processing lecture ${lectureId} failed:`, err.message);
    await query("UPDATE lectures SET status = 'error', error = $2 WHERE id = $1", [lectureId, err.message]);
  }
}

router.post('/courses/:id/lectures', uploadPdf, async (req, res) => {
  if (!req.file) throw httpError(400, 'Attach the lecture slides as a PDF');
  const course = await one('SELECT id FROM courses WHERE id = $1', [req.params.id]);
  if (!course) { removeFile(req.file.path); throw httpError(404, 'Course not found'); }

  const next = await one('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM lectures WHERE course_id = $1', [course.id]);
  const number = Number(req.body.number) || next.n;
  const title = req.body.title?.trim() || `Lecture ${number}`;

  const lecture = await one(
    'INSERT INTO lectures (course_id, number, title, file_path) VALUES ($1, $2, $3, $4) RETURNING *',
    [course.id, number, title, req.file.path],
  );
  processLecture(lecture.id); // not awaited on purpose
  res.status(201).json(lecture);
});

router.get('/lectures/:id', async (req, res) => {
  const lecture = await one(
    `SELECT l.id, l.course_id, l.number, l.title, l.status, l.error, l.summary,
            c.code AS course_code, c.name AS course_name
     FROM lectures l JOIN courses c ON c.id = l.course_id WHERE l.id = $1`, [req.params.id]);
  if (!lecture) throw httpError(404, 'Lecture not found');
  lecture.topics = await query(
    `SELECT id, position, title, summary, slides, completed, beyond, related,
            lesson_md IS NOT NULL AS has_lesson
     FROM topics WHERE lecture_id = $1 ORDER BY position`, [lecture.id]);
  res.json(lecture);
});

router.post('/lectures/:id/reprocess', async (req, res) => {
  const lecture = await one('SELECT id FROM lectures WHERE id = $1', [req.params.id]);
  if (!lecture) throw httpError(404, 'Lecture not found');
  processLecture(lecture.id);
  res.json({ status: 'processing' });
});

router.delete('/lectures/:id', async (req, res) => {
  const lecture = await one('DELETE FROM lectures WHERE id = $1 RETURNING file_path', [req.params.id]);
  if (lecture) removeFile(lecture.file_path);
  res.status(204).end();
});

// ---------- topics & lessons ----------

router.get('/topics/:id', async (req, res) => {
  const topic = await one('SELECT * FROM topics WHERE id = $1', [req.params.id]);
  if (!topic) throw httpError(404, 'Topic not found');
  res.json(topic);
});

// Returns the saved lesson, generating it the first time (or when ?force=true)
router.post('/topics/:id/lesson', async (req, res) => {
  const topic = await one('SELECT * FROM topics WHERE id = $1', [req.params.id]);
  if (!topic) throw httpError(404, 'Topic not found');
  if (topic.lesson_md && req.query.force !== 'true') return res.json(topic);

  const lecture = await one('SELECT * FROM lectures WHERE id = $1', [topic.lecture_id]);
  const course = await one('SELECT * FROM courses WHERE id = $1', [topic.course_id]);
  const all = await query('SELECT position, title FROM topics WHERE lecture_id = $1 ORDER BY position', [lecture.id]);

  const lessonMd = await writeLesson(lecture.file_path, lecture, course, topic, all);
  const saved = await one('UPDATE topics SET lesson_md = $2 WHERE id = $1 RETURNING *', [topic.id, lessonMd]);
  res.json(saved);
});

router.patch('/topics/:id', async (req, res) => {
  const topic = await one('UPDATE topics SET completed = $2 WHERE id = $1 RETURNING *',
    [req.params.id, Boolean(req.body?.completed)]);
  if (!topic) throw httpError(404, 'Topic not found');
  res.json(topic);
});

export default router;
