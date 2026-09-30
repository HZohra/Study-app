import { Router } from 'express';
import { query, one, pool } from '../db.js';
import { httpError } from '../files.js';
import { makeQuiz } from '../claude.js';
import { topicMastery } from '../mastery.js';

const router = Router();

async function createQuiz(db, { courseId, lectureId, kind, title, questionIds }) {
  const { rows: [quiz] } = await db.query(
    'INSERT INTO quizzes (course_id, lecture_id, kind, title) VALUES ($1, $2, $3, $4) RETURNING *',
    [courseId, lectureId, kind, title],
  );
  let position = 1;
  for (const qid of questionIds) {
    await db.query('INSERT INTO quiz_questions (quiz_id, question_id, position) VALUES ($1, $2, $3)',
      [quiz.id, qid, position++]);
  }
  return quiz;
}

// New end-of-lecture quiz: Claude writes fresh questions, which are saved to the bank
router.post('/lectures/:id/quiz', async (req, res) => {
  const lecture = await one('SELECT * FROM lectures WHERE id = $1', [req.params.id]);
  if (!lecture) throw httpError(404, 'Lecture not found');
  if (lecture.status !== 'ready') throw httpError(409, 'This lecture is still being processed');
  const course = await one('SELECT * FROM courses WHERE id = $1', [lecture.course_id]);
  const topics = await query('SELECT id, title, summary FROM topics WHERE lecture_id = $1 ORDER BY position', [lecture.id]);
  const perTopic = Math.min(Math.max(Number(req.body?.perTopic) || 2, 1), 4);

  const generated = await makeQuiz(lecture.file_path, lecture, course, topics, perTopic);
  const topicIds = new Set(topics.map((t) => t.id));

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const ids = [];
    for (const q of generated) {
      if (!Array.isArray(q.options) || q.options.length < 2) continue;
      const { rows: [row] } = await db.query(
        `INSERT INTO questions (course_id, lecture_id, topic_id, prompt, options, correct_index, explanation, difficulty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [course.id, lecture.id, topicIds.has(q.topic_id) ? q.topic_id : null, q.prompt,
          JSON.stringify(q.options), q.correct_index, q.explanation, q.difficulty],
      );
      ids.push(row.id);
    }
    if (!ids.length) throw httpError(502, 'No usable questions came back. Try again.');
    const quiz = await createQuiz(db, {
      courseId: course.id, lectureId: lecture.id, kind: 'lecture',
      title: `${course.code} Lecture ${lecture.number} quiz`, questionIds: ids,
    });
    await db.query('COMMIT');
    res.status(201).json(quiz);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// Practice exam from the saved question bank, weighted toward weak topics.
// No API call, so it is instant and free.
router.post('/courses/:id/practice', async (req, res) => {
  const courseId = Number(req.params.id);
  const course = await one('SELECT * FROM courses WHERE id = $1', [courseId]);
  if (!course) throw httpError(404, 'Course not found');

  const lectureIds = Array.isArray(req.body?.lectureIds) ? req.body.lectureIds.map(Number) : [];
  const count = Math.min(Math.max(Number(req.body?.count) || 20, 5), 100);

  const questions = await query(`
    SELECT q.id, q.topic_id,
      (SELECT qq.is_correct FROM quiz_questions qq
        WHERE qq.question_id = q.id AND qq.is_correct IS NOT NULL
        ORDER BY qq.answered_at DESC LIMIT 1) AS last_correct
    FROM questions q
    WHERE q.course_id = $1 AND ($2::int[] = '{}' OR q.lecture_id = ANY($2::int[]))`,
  [courseId, lectureIds]);
  if (!questions.length) throw httpError(409, 'No saved questions yet. Take a lecture quiz first.');

  const mastery = new Map((await topicMastery(courseId)).map((t) => [t.id, t.mastery]));
  const scored = questions.map((q) => {
    const m = mastery.get(q.topic_id);
    let weight = m === null || m === undefined ? 1 : 1 - m / 100; // weak topics first
    if (q.last_correct === false) weight += 0.6;                  // missed last time
    if (q.last_correct === null) weight += 0.3;                   // never answered
    return { id: q.id, weight: weight + Math.random() * 0.5 };    // a little variety
  });
  const picked = scored.sort((a, b) => b.weight - a.weight).slice(0, count)
    .map((q) => q.id).sort(() => Math.random() - 0.5);

  const label = req.body?.title?.trim() || (lectureIds.length ? 'Practice exam' : 'Full course practice exam');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const quiz = await createQuiz(db, { courseId, lectureId: null, kind: 'practice', title: `${course.code} ${label}`, questionIds: picked });
    await db.query('COMMIT');
    res.status(201).json(quiz);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
});

// Quiz with its questions. Answers are only included once you have answered.
router.get('/quizzes/:id', async (req, res) => {
  const quiz = await one(
    `SELECT z.*, c.code AS course_code FROM quizzes z JOIN courses c ON c.id = z.course_id WHERE z.id = $1`,
    [req.params.id]);
  if (!quiz) throw httpError(404, 'Quiz not found');
  const rows = await query(`
    SELECT q.id, q.prompt, q.options, q.correct_index, q.explanation, q.difficulty,
           t.title AS topic_title, qq.position, qq.chosen_index, qq.is_correct
    FROM quiz_questions qq
    JOIN questions q ON q.id = qq.question_id
    LEFT JOIN topics t ON t.id = q.topic_id
    WHERE qq.quiz_id = $1 ORDER BY qq.position`, [quiz.id]);
  const finished = Boolean(quiz.completed_at);
  quiz.questions = rows.map((r) => {
    const reveal = finished || r.chosen_index !== null;
    return { ...r, correct_index: reveal ? r.correct_index : null, explanation: reveal ? r.explanation : null };
  });
  res.json(quiz);
});

router.post('/quizzes/:id/answer', async (req, res) => {
  const { questionId, chosenIndex } = req.body ?? {};
  const quiz = await one('SELECT * FROM quizzes WHERE id = $1', [req.params.id]);
  if (!quiz) throw httpError(404, 'Quiz not found');
  if (quiz.completed_at) throw httpError(409, 'This quiz is already finished');

  const q = await one(`
    SELECT q.correct_index, q.explanation, qq.chosen_index
    FROM quiz_questions qq JOIN questions q ON q.id = qq.question_id
    WHERE qq.quiz_id = $1 AND qq.question_id = $2`, [quiz.id, questionId]);
  if (!q) throw httpError(404, 'That question is not in this quiz');
  if (q.chosen_index !== null) throw httpError(409, 'Already answered');

  const isCorrect = Number(chosenIndex) === q.correct_index;
  await query(`UPDATE quiz_questions SET chosen_index = $3, is_correct = $4, answered_at = now()
               WHERE quiz_id = $1 AND question_id = $2`, [quiz.id, questionId, Number(chosenIndex), isCorrect]);
  res.json({ isCorrect, correctIndex: q.correct_index, explanation: q.explanation });
});

router.post('/quizzes/:id/finish', async (req, res) => {
  const stats = await one(`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_correct)::int AS correct
    FROM quiz_questions WHERE quiz_id = $1`, [req.params.id]);
  if (!stats.total) throw httpError(404, 'Quiz not found');
  const score = Math.round((stats.correct / stats.total) * 100);
  const quiz = await one(
    'UPDATE quizzes SET score = $2, completed_at = COALESCE(completed_at, now()) WHERE id = $1 RETURNING *',
    [req.params.id, score]);
  res.json({ ...quiz, ...stats });
});

router.get('/courses/:id/quizzes', async (req, res) => {
  res.json(await query(`
    SELECT z.*, (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = z.id)::int AS question_count
    FROM quizzes z WHERE z.course_id = $1 ORDER BY z.created_at DESC`, [req.params.id]));
});

// The question bank, with how often you got each question right
router.get('/courses/:id/questions', async (req, res) => {
  const lectureId = req.query.lectureId ? Number(req.query.lectureId) : null;
  res.json(await query(`
    SELECT q.id, q.prompt, q.options, q.correct_index, q.explanation, q.difficulty,
           q.lecture_id, l.number AS lecture_number, t.title AS topic_title,
           COUNT(qq.is_correct)::int AS times_answered,
           COUNT(*) FILTER (WHERE qq.is_correct)::int AS times_correct
    FROM questions q
    LEFT JOIN lectures l ON l.id = q.lecture_id
    LEFT JOIN topics t ON t.id = q.topic_id
    LEFT JOIN quiz_questions qq ON qq.question_id = q.id
    WHERE q.course_id = $1 AND ($2::int IS NULL OR q.lecture_id = $2)
    GROUP BY q.id, l.number, t.title, t.position
    ORDER BY l.number, t.position, q.id`, [req.params.id, lectureId]));
});

router.delete('/questions/:id', async (req, res) => {
  await query('DELETE FROM questions WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
