import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  BankQuestion, ChatMessage, Course, CourseDetail, Dashboard, Lecture, Progress, Quiz, Topic,
} from './models';

// Every call to the backend goes through here. Methods return Promises so
// components can simply `await` them.
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = '/api';

  private get<T>(url: string) { return firstValueFrom(this.http.get<T>(this.base + url)); }
  private post<T>(url: string, body: unknown = {}) { return firstValueFrom(this.http.post<T>(this.base + url, body)); }
  private patch<T>(url: string, body: unknown) { return firstValueFrom(this.http.patch<T>(this.base + url, body)); }
  private delete(url: string) { return firstValueFrom(this.http.delete<void>(this.base + url)); }

  // dashboard & courses
  dashboard() { return this.get<Dashboard>('/dashboard'); }
  courses() { return this.get<Course[]>('/courses'); }
  course(id: number) { return this.get<CourseDetail>(`/courses/${id}`); }
  createCourse(body: { code: string; name: string; term?: string }) { return this.post<Course>('/courses', body); }
  deleteCourse(id: number) { return this.delete(`/courses/${id}`); }

  uploadSyllabus(courseId: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.post<{ summary: string; items: number }>(`/courses/${courseId}/syllabus`, form);
  }

  // lectures & topics
  uploadLecture(courseId: number, file: File, title: string, number?: number) {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    if (number) form.append('number', String(number));
    return this.post<Lecture>(`/courses/${courseId}/lectures`, form);
  }
  lecture(id: number) { return this.get<Lecture>(`/lectures/${id}`); }
  reprocessLecture(id: number) { return this.post(`/lectures/${id}/reprocess`); }
  deleteLecture(id: number) { return this.delete(`/lectures/${id}`); }
  lesson(topicId: number, force = false) { return this.post<Topic>(`/topics/${topicId}/lesson${force ? '?force=true' : ''}`); }
  setTopicDone(topicId: number, completed: boolean) { return this.patch<Topic>(`/topics/${topicId}`, { completed }); }

  // quizzes
  newLectureQuiz(lectureId: number, perTopic = 2) { return this.post<Quiz>(`/lectures/${lectureId}/quiz`, { perTopic }); }
  newPractice(courseId: number, body: { lectureIds: number[]; count: number; title?: string }) { return this.post<Quiz>(`/courses/${courseId}/practice`, body); }
  quiz(id: number) { return this.get<Quiz>(`/quizzes/${id}`); }
  answer(quizId: number, questionId: number, chosenIndex: number) {
    return this.post<{ isCorrect: boolean; correctIndex: number; explanation: string }>(`/quizzes/${quizId}/answer`, { questionId, chosenIndex });
  }
  finishQuiz(quizId: number) { return this.post<Quiz & { total: number; correct: number }>(`/quizzes/${quizId}/finish`); }
  quizzes(courseId: number) { return this.get<Quiz[]>(`/courses/${courseId}/quizzes`); }
  questionBank(courseId: number, lectureId?: number) {
    return this.get<BankQuestion[]>(`/courses/${courseId}/questions${lectureId ? `?lectureId=${lectureId}` : ''}`);
  }
  deleteQuestion(id: number) { return this.delete(`/questions/${id}`); }

  // progress & chat
  progress(courseId: number) { return this.get<Progress>(`/courses/${courseId}/progress`); }
  chatHistory(courseId: number, lectureId?: number) {
    return this.get<ChatMessage[]>(`/courses/${courseId}/chat${lectureId ? `?lectureId=${lectureId}` : ''}`);
  }
  ask(courseId: number, message: string, lectureId?: number) {
    return this.post<{ answer: string }>(`/courses/${courseId}/chat`, { message, lectureId });
  }
  clearChat(courseId: number, lectureId?: number) {
    return this.delete(`/courses/${courseId}/chat${lectureId ? `?lectureId=${lectureId}` : ''}`);
  }
}

// Turns any failed request into a sentence you can show on screen
export function errorText(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Is it running (npm run dev in /server)?';
    return err.error?.error ?? err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
