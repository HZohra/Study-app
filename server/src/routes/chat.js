import { Router } from 'express';
import { query, one } from '../db.js';
import { httpError } from '../files.js';
import { chat } from '../claude.js';

const router = Router();
const MAX_NOTES_CHARS = 150_000; // keeps whole-course chat within a sensible size

// Text context for the chat. Lecture chat also gets the slide PDF itself.
async function buildNotes(course, lecture) {
  if (lecture) {
    const topics = await query('SELECT position, title, summary, slides FROM topics WHERE lecture_id = $1 ORDER BY position', [lecture.id]);
    return `Lecture ${lecture.number}: ${lecture.title}\n${lecture.summary ?? ''}\nTopics:\n` +
      topics.map((t) => `${t.position}. ${t.title} (slides ${t.slides}): ${t.summary}`).join('\n');
  }

  let notes = `${course.code} ${course.name}\n${course.syllabus_summary ?? ''}\n`;
  const weeks = await query('SELECT week, title FROM syllabus_items WHERE course_id = $1 ORDER BY week', [course.id]);
  if (weeks.length) notes += `\nSyllabus:\n${weeks.map((w) => `Week ${w.week}: ${w.title}`).join('\n')}\n`;

  const topics = await query(`
    SELECT l.number, l.title AS lecture_title, t.title, t.summary, t.slides, t.lesson_md
    FROM topics t JOIN lectures l ON l.id = t.lecture_id
    WHERE t.course_id = $1 ORDER BY l.number, t.position`, [course.id]);
  let current = null;
  for (const t of topics) {
    if (t.number !== current) { notes += `\n# Lecture ${t.number}: ${t.lecture_title}\n`; current = t.number; }
    notes += `\n## ${t.title} (slides ${t.slides})\n${t.lesson_md || t.summary}\n`;
    if (notes.length > MAX_NOTES_CHARS) { notes += '\n(notes truncated)'; break; }
  }
  return notes;
}

router.get('/courses/:id/chat', async (req, res) => {
  const lectureId = req.query.lectureId ? Number(req.query.lectureId) : null;
  res.json(await query(
    `SELECT id, role, content, created_at FROM chat_messages
     WHERE course_id = $1 AND lecture_id IS NOT DISTINCT FROM $2 ORDER BY id`,
    [req.params.id, lectureId]));
});

router.post('/courses/:id/chat', async (req, res) => {
  const message = req.body?.message?.trim();
  if (!message) throw httpError(400, 'Type a question first');
  const lectureId = req.body.lectureId ? Number(req.body.lectureId) : null;

  const course = await one('SELECT * FROM courses WHERE id = $1', [req.params.id]);
  if (!course) throw httpError(404, 'Course not found');
  const lecture = lectureId
    ? await one('SELECT * FROM lectures WHERE id = $1 AND course_id = $2', [lectureId, course.id])
    : null;
  if (lectureId && !lecture) throw httpError(404, 'Lecture not found');

  // Last 10 messages give the conversation memory without growing forever
  const history = (await query(
    `SELECT role, content FROM chat_messages
     WHERE course_id = $1 AND lecture_id IS NOT DISTINCT FROM $2 ORDER BY id DESC LIMIT 10`,
    [course.id, lectureId])).reverse();

  const answer = await chat({
    course, lecture,
    filePath: lecture?.file_path ?? null,
    notes: await buildNotes(course, lecture),
    history, question: message,
  });

  await query(
    `INSERT INTO chat_messages (course_id, lecture_id, role, content)
     VALUES ($1, $2, 'user', $3), ($1, $2, 'assistant', $4)`,
    [course.id, lectureId, message, answer]);
  res.json({ answer });
});

router.delete('/courses/:id/chat', async (req, res) => {
  const lectureId = req.query.lectureId ? Number(req.query.lectureId) : null;
  await query('DELETE FROM chat_messages WHERE course_id = $1 AND lecture_id IS NOT DISTINCT FROM $2',
    [req.params.id, lectureId]);
  res.status(204).end();
});

export default router;
