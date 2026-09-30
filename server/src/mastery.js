import { query } from './db.js';

// Mastery of a topic = how many of your last 5 answers on it were correct.
// Readiness of a course = average mastery over all its topics,
// where a topic you have never been quizzed on counts as 0%.

const MASTERY_SQL = `
  SELECT t.id, t.title, t.lecture_id, t.completed, l.number AS lecture_number,
         recent.mastery, COALESCE(recent.attempts, 0)::int AS attempts
  FROM topics t
  JOIN lectures l ON l.id = t.lecture_id
  LEFT JOIN LATERAL (
    SELECT AVG(CASE WHEN x.is_correct THEN 1.0 ELSE 0 END) AS mastery, COUNT(*) AS attempts
    FROM (
      SELECT qq.is_correct
      FROM quiz_questions qq
      JOIN questions q ON q.id = qq.question_id
      WHERE q.topic_id = t.id AND qq.is_correct IS NOT NULL
      ORDER BY qq.answered_at DESC
      LIMIT 5
    ) x
  ) recent ON true
  WHERE t.course_id = $1
  ORDER BY l.number, t.position`;

export async function topicMastery(courseId) {
  const rows = await query(MASTERY_SQL, [courseId]);
  return rows.map((r) => ({
    ...r,
    mastery: r.mastery === null ? null : Math.round(Number(r.mastery) * 100),
    level: r.mastery === null ? 'untested' : r.mastery >= 0.8 ? 'strong' : r.mastery >= 0.6 ? 'okay' : 'weak',
  }));
}

export function readinessOf(topics) {
  if (!topics.length) return 0;
  const total = topics.reduce((sum, t) => sum + (t.mastery ?? 0), 0);
  return Math.round(total / topics.length);
}
