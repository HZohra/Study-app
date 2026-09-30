import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorText } from '../api';
import { Course } from '../models';
import { QuestionBank } from '../shared/question-bank';

// Question Bank across all courses: pick a course, then browse or practice
@Component({
  selector: 'app-question-bank-page',
  imports: [FormsModule, RouterLink, QuestionBank],
  template: `
    <header class="mb-6 flex flex-wrap items-end gap-4">
      <div class="mr-auto">
        <h1 class="text-3xl font-extrabold">Question Bank</h1>
        <p class="muted">Every quiz question you've taken, ready for midterm and final practice.</p>
      </div>
      @if (courses().length) {
        <select class="input !w-auto" [(ngModel)]="courseId">
          @for (c of courses(); track c.id) { <option [ngValue]="c.id">{{ c.code }} – {{ c.name }} ({{ c.question_count }})</option> }
        </select>
      }
    </header>

    @if (error()) { <div class="error-box mb-6">{{ error() }}</div> }
    @if (courseId) {
      <app-question-bank [courseId]="courseId" />
    } @else if (!loading()) {
      <div class="card muted">No courses yet. <a routerLink="/courses" class="text-cobalt">Create one</a> to get started.</div>
    }
  `,
})
export class QuestionBankPage {
  private api = inject(Api);
  courses = signal<Course[]>([]);
  loading = signal(true);
  error = signal('');
  courseId: number | null = null;

  constructor() {
    this.api.courses()
      .then((c) => {
        this.courses.set(c);
        // start on the course with the most questions
        this.courseId = [...c].sort((a, b) => (b.question_count ?? 0) - (a.question_count ?? 0))[0]?.id ?? null;
      })
      .catch((e) => this.error.set(errorText(e)))
      .finally(() => this.loading.set(false));
  }
}
