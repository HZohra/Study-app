// Sample AI responses used when MOCK_AI=true.
// Lets you click through the whole app without an API key or any cost.

export function syllabus(course) {
  const titles = [
    'Course introduction and tooling', 'Core concepts', 'Data structures in practice',
    'Designing APIs', 'Databases and persistence', 'Testing and debugging',
    'Midterm review', 'Concurrency', 'Networking and REST APIs',
    'Security basics', 'Performance', 'Final review',
  ];
  return {
    summary: `${course.code} covers the core ideas of ${course.name} through lectures, labs and a final project. (Sample summary: MOCK_AI is on.)`,
    items: titles.map((title, i) => ({ week: i + 1, title, details: '' })),
  };
}

export function topics(lecture) {
  const names = ['Key definitions', 'How it works', 'Worked example', 'Trade-offs and pitfalls'];
  return {
    lecture_title: lecture.title,
    lecture_summary: 'Sample lecture summary generated in mock mode.',
    topics: names.map((title, i) => ({
      title,
      summary: `A sample summary of "${title}".`,
      slides: `${i * 5 + 1}-${i * 5 + 5}`,
      beyond: ['Node.js', 'PostgreSQL', 'Docker'].slice(0, 2 + (i % 2)),
      related: i === 2 ? [{ course_code: 'CP264', where: 'Lecture 7', relation: 'covered' }]
        : i === 3 ? [{ course_code: 'CP470', where: 'Week 9', relation: 'upcoming' }] : [],
    })),
  };
}

export function lesson(topic) {
  return `## The big idea
This is a **sample lesson** for *${topic.title}* (mock mode is on, so no real AI was used).

## In detail
With a real API key, this section teaches the topic step by step using your slides (Slide ${topic.slides}).

\`\`\`java
// Example code block
int total = 0;
for (int n : numbers) total += n;
\`\`\`

## Common mistakes and exam traps
- Mixing up similar terms
- Forgetting edge cases

## How current is this?
Foundational: still used everywhere.

## What you can do with it
1. Build a small project that uses it
2. Explain it in an interview

## Quick recap
- Point one
- Point two
- Point three`;
}

export function quiz(topics, perTopic) {
  const out = [];
  for (const t of topics) {
    for (let i = 0; i < perTopic; i++) {
      out.push({
        topic_id: t.id,
        prompt: `Sample question ${i + 1} about "${t.title}". Which option is correct?`,
        options: ['Option A', 'Option B (correct)', 'Option C', 'Option D'],
        correct_index: 1,
        explanation: 'B is correct in this sample question. Real explanations come from Claude.',
        difficulty: ['easy', 'medium', 'hard'][i % 3],
      });
    }
  }
  return out;
}

export function chat(question, lecture) {
  return `(Mock answer) You asked: "${question}". With a real API key I would answer from ${lecture ? `Lecture ${lecture.number}` : 'your course material'} and cite the slides.`;
}
