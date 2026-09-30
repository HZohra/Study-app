-- Trackr Study database schema (PostgreSQL)
-- Run with: npm run db:init

CREATE TABLE IF NOT EXISTS courses (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL,              -- e.g. CP470
  name             TEXT NOT NULL,              -- e.g. Android Development
  term             TEXT,                       -- e.g. Fall 2026
  syllabus_path    TEXT,                       -- uploaded syllabus PDF
  syllabus_summary TEXT,                       -- short AI summary of the course
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Planned topics from the syllabus, week by week
CREATE TABLE IF NOT EXISTS syllabus_items (
  id        SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week      INT,
  title     TEXT NOT NULL,
  details   TEXT
);

CREATE TABLE IF NOT EXISTS lectures (
  id         SERIAL PRIMARY KEY,
  course_id  INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number     INT NOT NULL,                     -- lecture / chapter number
  title      TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'uploaded', -- uploaded | processing | ready | error
  error      TEXT,
  summary    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Topics the AI detected in a lecture. Lessons are generated the first time
-- a topic is opened and then saved, so reopening it is instant and free.
CREATE TABLE IF NOT EXISTS topics (
  id           SERIAL PRIMARY KEY,
  lecture_id   INT NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  course_id    INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position     INT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT,
  slides       TEXT,                           -- e.g. "4-9"
  lesson_md    TEXT,                           -- saved lesson (markdown)
  completed    BOOLEAN NOT NULL DEFAULT false,
  beyond       JSONB NOT NULL DEFAULT '[]',    -- "commonly used with" technologies
  related      JSONB NOT NULL DEFAULT '[]'     -- links to other courses
);

-- Every quiz question ever generated: this is the question bank
CREATE TABLE IF NOT EXISTS questions (
  id            SERIAL PRIMARY KEY,
  course_id     INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lecture_id    INT REFERENCES lectures(id) ON DELETE CASCADE,
  topic_id      INT REFERENCES topics(id) ON DELETE SET NULL,
  prompt        TEXT NOT NULL,
  options       JSONB NOT NULL,                -- ["A", "B", "C", "D"]
  correct_index INT NOT NULL,
  explanation   TEXT,
  difficulty    TEXT DEFAULT 'medium',         -- easy | medium | hard
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quizzes (
  id           SERIAL PRIMARY KEY,
  course_id    INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lecture_id   INT REFERENCES lectures(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'lecture', -- lecture | practice
  title        TEXT NOT NULL,
  score        NUMERIC,                         -- 0-100 once submitted
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Which questions were in each quiz, and how you answered them
CREATE TABLE IF NOT EXISTS quiz_questions (
  quiz_id      INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id  INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position     INT NOT NULL,
  chosen_index INT,
  is_correct   BOOLEAN,
  answered_at  TIMESTAMPTZ,
  PRIMARY KEY (quiz_id, question_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         SERIAL PRIMARY KEY,
  course_id  INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lecture_id INT REFERENCES lectures(id) ON DELETE CASCADE, -- null = whole-course chat
  role       TEXT NOT NULL,                                 -- user | assistant
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lectures_course  ON lectures(course_id);
CREATE INDEX IF NOT EXISTS idx_topics_lecture   ON topics(lecture_id);
CREATE INDEX IF NOT EXISTS idx_questions_course ON questions(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic  ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_chat_course      ON chat_messages(course_id, lecture_id);
