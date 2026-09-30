# Trackr Study

Upload your lecture slides, learn them topic by topic with Claude, quiz yourself, and see how ready you are for your exams.

Built with the same stack as Trackr AI (Angular + TypeScript + Tailwind, Node.js + Express, PostgreSQL, Claude API) so it can be merged into Trackr later.

## What it does

- **Courses** with a syllabus upload. Claude extracts the week-by-week plan.
- **Lectures**: upload slides as PDF. Claude reads them (including diagrams) and splits them into topics.
- **Lessons**: each topic is taught in detail the first time you open it, then saved (free to reopen). Includes "How current is this?" and "What you can do with it".
- **Related courses** and **Beyond the course** boxes on every topic.
- **Chat** about one lecture or the whole course, answered from your slides with slide numbers.
- **Lecture quizzes**: every question, answer and result is saved to the **Question Bank**.
- **Practice exams** from the bank, weighted toward weak topics and questions you missed. No API call, so instant and free.
- **Progress**: readiness %, strong / weak / untested topics, quiz scores over time.

## Setup

You need **Node.js 22+**, **PostgreSQL**, and a Claude API key from https://console.anthropic.com.

### 1. Database

```bash
createdb trackr_study
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env      # then edit .env: DATABASE_URL and ANTHROPIC_API_KEY
npm run db:init           # creates the tables
npm run dev               # API on http://localhost:3000
```

No API key yet? Set `MOCK_AI=true` in `.env` to click through the whole app with sample content.

### 3. Frontend

```bash
cd client
npm install
npm start                 # app on http://localhost:4200
```

Requests to `/api` are forwarded to the backend by `proxy.conf.json`.

## How to use it

1. **Courses → New course**, then upload the syllabus on the Overview tab.
2. Do this for all your courses first, so topics can be linked across them.
3. **Lectures tab**: upload each lecture PDF (save PowerPoints as PDF first).
4. Open a lecture, click **Learn this topic**, and work through the topics.
5. Click **Start lecture quiz** at the end of each lecture.
6. Before a midterm or final, open **Quiz Bank → Practice exam**.

## Keeping API costs low

- Topic detection and quizzes use the cheaper model (`MODEL_FAST`); lessons and chat use `MODEL_TEACH`. Change both in `.env`.
- Lessons are generated once and saved. **Rewrite lesson** is the only thing that regenerates one.
- Lecture PDFs are sent with prompt caching, so a lesson, quiz and chat on the same lecture within a few minutes reuse the cached PDF.
- Practice exams cost nothing: they only use saved questions.

## Project structure

```
server/
  schema.sql            database tables
  src/index.js          Express app
  src/db.js             PostgreSQL connection
  src/init-db.js        creates the tables
  src/claude.js         every Claude API call and prompt
  src/mock-ai.js        sample responses for MOCK_AI=true
  src/files.js          PDF uploads (swap for Azure Blob Storage later)
  src/mastery.js        readiness calculation
  src/routes/           courses, lectures + topics, quizzes, chat, progress

client/src/app/
  api.ts                all backend calls
  models.ts             TypeScript types
  markdown.pipe.ts      renders lessons and chat answers
  app.ts, app.routes.ts, app.config.ts
  pages/                dashboard, courses, course (tabs), lecture, quiz, question bank
  shared/               chat panel, question bank + practice builder, progress bar
```

## How readiness is calculated

- **Topic mastery** = share of your last 5 answers on that topic that were correct.
- **Course readiness** = average mastery across all topics. Topics you've never been quizzed on count as 0%, so the number only goes up by actually testing yourself.
- Strong ≥ 80%, okay 60–79%, weak < 60%.

## Later: merging into Trackr

- Move `server/src/routes/*` and `claude.js` into Trackr's Express backend and add your JWT middleware and a `user_id` column to `courses`.
- Move `client/src/app/pages` and `shared` into Trackr's Angular app.
- Replace `files.js` with Azure Blob Storage.
- Trackr already has exam dates, which could drive a study plan here.
