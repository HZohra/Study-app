import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Dashboard · Trackr Study', loadComponent: () => import('./pages/dashboard').then((m) => m.DashboardPage) },
  { path: 'courses', title: 'Courses · Trackr Study', loadComponent: () => import('./pages/courses').then((m) => m.CoursesPage) },
  { path: 'courses/:id', title: 'Course · Trackr Study', loadComponent: () => import('./pages/course').then((m) => m.CoursePage) },
  { path: 'lectures/:id', title: 'Lecture · Trackr Study', loadComponent: () => import('./pages/lecture').then((m) => m.LecturePage) },
  { path: 'quizzes/:id', title: 'Quiz · Trackr Study', loadComponent: () => import('./pages/quiz').then((m) => m.QuizPage) },
  { path: 'question-bank', title: 'Question Bank · Trackr Study', loadComponent: () => import('./pages/question-bank-page').then((m) => m.QuestionBankPage) },
  { path: '**', redirectTo: '' },
];
