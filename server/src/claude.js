import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import * as mock from './mock-ai.js';

// All Claude API calls live in this one file, so the rest of the app never
// needs to know about prompts or models.

const MOCK = process.env.MOCK_AI === 'true';
const MODEL_TEACH = process.env.MODEL_TEACH || 'claude-sonnet-5-5';
const MODEL_FAST = process.env.MODEL_FAST || 'claude-haiku-4-5-20251001';

const client = MOCK ? null : new Anthropic(); // reads ANTHROPIC_API_KEY

// ---------- helpers ----------

// A PDF sent straight to Claude, so it sees diagrams, tables and code
// screenshots, not just extracted text. cache_control lets repeat calls on
// the same lecture (lessons, quizzes, chat) reuse it at a much lower cost.
async function pdfBlock(filePath) {
  const data = (await fs.readFile(filePath)).toString('base64');
  return {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data },
    cache_control: { type: 'ephemeral' },
  };
}

// Forces Claude to answer through a "tool" so we always get clean JSON back.
async function structured({ model, system, content, toolName, schema, maxTokens = 8000 }) {
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools: [{ name: toolName, description: 'Return the result in this exact structure.', input_schema: schema }],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block) throw new Error('Claude did not return structured output');
  return block.input;
}

function textOf(res) {
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

const TUTOR_STYLE = `You are a patient, expert computer science tutor for a fourth-year university student.
Teach in detail but clearly: build intuition first, then precise definitions, then worked examples.
Base everything on the student's own lecture slides and cite them like (Slide 12).
If you add something the slides do not cover, say so briefly.`;

// ---------- syllabus ----------

export async function analyzeSyllabus(filePath, course) {
  if (MOCK) return mock.syllabus(course);
  return structured({
    model: MODEL_FAST,
    system: 'You read university course syllabi and extract their structure.',
    toolName: 'save_syllabus',
    content: [
      await pdfBlock(filePath),
      { type: 'text', text: `This is the syllabus for ${course.code} ${course.name}. Extract a two-sentence course summary and the planned topics week by week. If weeks are not numbered, number the topics in order.` },
    ],
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              week: { type: 'integer' },
              title: { type: 'string' },
              details: { type: 'string' },
            },
            required: ['week', 'title'],
          },
        },
      },
      required: ['summary', 'items'],
    },
  });
}

// ---------- lecture processing: detect topics ----------

// `context` describes the student's other courses (syllabus + lecture topics)
// so Claude can point out where a topic shows up elsewhere.
export async function detectTopics(filePath, lecture, course, context) {
  if (MOCK) return mock.topics(lecture);
  return structured({
    model: MODEL_FAST,
    system: 'You organize lecture slides into clear study topics for a university student.',
    toolName: 'save_topics',
    maxTokens: 6000,
    content: [
      await pdfBlock(filePath),
      {
        type: 'text',
        text: `These are the slides for ${course.code} ${course.name}, Lecture ${lecture.number}.

Split the lecture into 3 to 8 study topics in the order they are taught. For each topic give:
- a short title and a one-sentence summary
- the slide range it covers, like "4-9"
- "beyond": 2 to 5 real, currently used technologies, tools or frameworks this topic is commonly used with in industry
- "related": places the same idea appears in the student's courses, using ONLY the list below.
  relation is "covered" if it was already taught there, "upcoming" if it appears later in a syllabus.
  Leave it empty if nothing clearly matches. Do not invent courses.

The student's courses:
${context || '(no other course information yet)'}`,
      },
    ],
    schema: {
      type: 'object',
      properties: {
        lecture_title: { type: 'string' },
        lecture_summary: { type: 'string' },
        topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
              slides: { type: 'string' },
              beyond: { type: 'array', items: { type: 'string' } },
              related: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    course_code: { type: 'string' },
                    where: { type: 'string', description: 'e.g. "Lecture 7" or "Week 9"' },
                    relation: { type: 'string', enum: ['covered', 'upcoming'] },
                  },
                  required: ['course_code', 'where', 'relation'],
                },
              },
            },
            required: ['title', 'summary', 'slides', 'beyond', 'related'],
          },
        },
      },
      required: ['lecture_title', 'lecture_summary', 'topics'],
    },
  });
}

// ---------- lessons ----------

export async function writeLesson(filePath, lecture, course, topic, allTopics) {
  if (MOCK) return mock.lesson(topic);
  const outline = allTopics.map((t) => `${t.position}. ${t.title}`).join('\n');
  const res = await client.messages.create({
    model: MODEL_TEACH,
    max_tokens: 8000,
    system: TUTOR_STYLE,
    messages: [
      {
        role: 'user',
        content: [
          await pdfBlock(filePath),
          {
            type: 'text',
            text: `Course: ${course.code} ${course.name}, Lecture ${lecture.number}: ${lecture.title}
Lecture outline:
${outline}

Teach me topic ${topic.position}: "${topic.title}" (slides ${topic.slides}).

Write the lesson in Markdown with these sections:
## The big idea
## In detail
(definitions, how it works step by step, and code or worked examples where useful)
## Common mistakes and exam traps
## How current is this?
(one short paragraph: is this foundational, still standard, or dated? what is used today instead or alongside it?)
## What you can do with it
(2 or 3 concrete things I could build or apply this to)
## Quick recap
(3 to 5 bullet points)`,
          },
        ],
      },
    ],
  });
  return textOf(res);
}

// ---------- quizzes ----------

export async function makeQuiz(filePath, lecture, course, topics, perTopic = 2) {
  if (MOCK) return mock.quiz(topics, perTopic);
  const list = topics.map((t) => `id=${t.id}: ${t.title} — ${t.summary}`).join('\n');
  const result = await structured({
    model: MODEL_FAST,
    system: 'You write fair, exam-style multiple-choice questions for university computer science courses.',
    toolName: 'save_quiz',
    content: [
      await pdfBlock(filePath),
      {
        type: 'text',
        text: `Course: ${course.code}, Lecture ${lecture.number}: ${lecture.title}
Write ${perTopic} multiple-choice questions for EACH topic below (mix easy, medium and hard).
Each question has exactly 4 options, one correct answer, and an explanation that says why the answer is right and why the most tempting wrong option is wrong.
Test understanding and application, not just memorized wording. Tag each question with its topic id.

Topics:
${list}`,
      },
    ],
    maxTokens: 10000,
    schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic_id: { type: 'integer' },
              prompt: { type: 'string' },
              options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
              correct_index: { type: 'integer', minimum: 0, maximum: 3 },
              explanation: { type: 'string' },
              difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            },
            required: ['topic_id', 'prompt', 'options', 'correct_index', 'explanation', 'difficulty'],
          },
        },
      },
      required: ['questions'],
    },
  });
  return result.questions;
}

// ---------- chat ----------

// scope.filePath: the lecture PDF (lecture chat) or null (course chat)
// scope.notes: text context (saved topics / lessons / syllabus)
export async function chat({ course, lecture, filePath, notes, history, question }) {
  if (MOCK) return mock.chat(question, lecture);

  const where = lecture
    ? `the student's ${course.code} Lecture ${lecture.number}: ${lecture.title}`
    : `the student's ${course.code} ${course.name} course`;

  // Put the course material in the first user turn so it can be cached.
  const material = [];
  if (filePath) material.push(await pdfBlock(filePath));
  material.push({
    type: 'text',
    text: `Course material notes:\n${notes || '(none yet)'}`,
    cache_control: { type: 'ephemeral' },
  });

  const messages = [
    { role: 'user', content: material },
    { role: 'assistant', content: 'I have the course material. What would you like to know?' },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  const res = await client.messages.create({
    model: MODEL_TEACH,
    max_tokens: 3000,
    system: `${TUTOR_STYLE}
You are answering questions about ${where}.
Answer from the material first. If the answer goes beyond it, say "Beyond the slides:" before that part.
Keep answers focused; use short code examples when they help.`,
    messages,
  });
  return textOf(res);
}
