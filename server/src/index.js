import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import courses from './routes/courses.js';
import lectures from './routes/lectures.js';
import quizzes from './routes/quizzes.js';
import chat from './routes/chat.js';
import progress from './routes/progress.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, mockAi: process.env.MOCK_AI === 'true' }));

app.use('/api', courses);
app.use('/api', lectures);
app.use('/api', quizzes);
app.use('/api', chat);
app.use('/api', progress);

// One place that turns any thrown error into a JSON response
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  res.status(status).json({ error: err.message || 'Something went wrong' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Trackr Study API on http://localhost:${port}`);
  if (process.env.MOCK_AI === 'true') console.log('MOCK_AI is on: sample AI content, no API calls.');
});
