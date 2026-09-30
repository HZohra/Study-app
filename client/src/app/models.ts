// Shapes of the data the API returns

export interface Course {
  id: number;
  code: string;
  name: string;
  term: string | null;
  syllabus_summary: string | null;
  lecture_count?: number;
  topic_count?: number;
  topics_done?: number;
  question_count?: number;
  readiness?: number;
}

export interface SyllabusItem { id: number; week: number | null; title: string; details: string | null; }

export interface LectureSummary {
  id: number;
  number: number;
  title: string;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  error: string | null;
  summary: string | null;
  topic_count: number;
  topics_done: number;
}

export interface CourseDetail extends Course {
  syllabus: SyllabusItem[];
  lectures: LectureSummary[];
}

export interface Related { course_code: string; where: string; relation: 'covered' | 'upcoming'; }

export interface Topic {
  id: number;
  position: number;
  title: string;
  summary: string;
  slides: string;
  completed: boolean;
  beyond: string[];
  related: Related[];
  has_lesson?: boolean;
  lesson_md?: string | null;
}

export interface Lecture {
  id: number;
  course_id: number;
  course_code: string;
  course_name: string;
  number: number;
  title: string;
  status: LectureSummary['status'];
  error: string | null;
  summary: string | null;
  topics: Topic[];
}

export interface QuizQuestion {
  id: number;
  prompt: string;
  options: string[];
  correct_index: number | null;
  explanation: string | null;
  difficulty: string;
  topic_title: string | null;
  chosen_index: number | null;
  is_correct: boolean | null;
}

export interface Quiz {
  id: number;
  course_id: number;
  course_code: string;
  lecture_id: number | null;
  kind: 'lecture' | 'practice';
  title: string;
  score: number | null;
  completed_at: string | null;
  created_at: string;
  question_count?: number;
  questions: QuizQuestion[];
}

export interface BankQuestion {
  id: number;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  difficulty: string;
  lecture_id: number;
  lecture_number: number;
  topic_title: string | null;
  times_answered: number;
  times_correct: number;
}

export interface TopicMastery {
  id: number;
  title: string;
  lecture_id: number;
  lecture_number: number;
  completed: boolean;
  mastery: number | null;
  attempts: number;
  level: 'strong' | 'okay' | 'weak' | 'untested';
}

export interface Progress {
  course: { id: number; code: string; name: string };
  readiness: number;
  lectures: { id: number; number: number; title: string; topic_count: number; topics_done: number; avg_quiz_score: number | null }[];
  quizzes: { id: number; title: string; kind: string; score: number; completed_at: string }[];
  topics: TopicMastery[];
  strong: TopicMastery[];
  weak: TopicMastery[];
  untested: TopicMastery[];
}

export interface Dashboard {
  courses: (Course & { readiness: number; topic_count: number; topics_done: number; weak: TopicMastery[]; next: TopicMastery | null })[];
  recentQuizzes: { id: number; title: string; score: number; completed_at: string }[];
}

export interface ChatMessage { id?: number; role: 'user' | 'assistant'; content: string; }
