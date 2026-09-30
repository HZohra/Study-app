import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorText } from '../api';
import { Course } from '../models';
import { Meter } from '../shared/meter';

@Component({
  selector: 'app-courses',
  imports: [FormsModule, RouterLink, Meter],
  template: `
    <header class="mb-8 flex flex-wrap items-end gap-4">
      <div class="mr-auto">
        <h1 class="text-3xl font-extrabold">Courses</h1>
        <p class="muted">One course per class you're taking this term.</p>
      </div>
      <button class="btn-primary" (click)="showForm.set(!showForm())">{{ showForm() ? 'Cancel' : '+ New course' }}</button>
    </header>

    @if (showForm()) {
      <form class="card mb-8 grid gap-4 md:grid-cols-[140px_1fr_160px_auto] items-end" (ngSubmit)="create()">
        <div><label class="label" for="code">Code</label><input id="code" class="input" name="code" [(ngModel)]="code" placeholder="CP470" required></div>
        <div><label class="label" for="name">Name</label><input id="name" class="input" name="name" [(ngModel)]="name" placeholder="Android Development" required></div>
        <div><label class="label" for="term">Term</label><input id="term" class="input" name="term" [(ngModel)]="term"></div>
        <button class="btn-primary" [disabled]="!code.trim() || !name.trim() || saving()">Create</button>
      </form>
    }

    @if (error()) { <div class="error-box mb-6">{{ error() }}</div> }

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      @for (c of courses(); track c.id) {
        <a [routerLink]="['/courses', c.id]" class="card hover:border-cobalt transition flex flex-col gap-3">
          <div>
            <p class="text-xs font-semibold text-cobalt">{{ c.code }} @if (c.term) { · {{ c.term }} }</p>
            <h2 class="text-lg font-bold">{{ c.name }}</h2>
          </div>
          <p class="muted">{{ c.lecture_count }} lectures · {{ c.question_count }} saved questions</p>
          <app-meter [value]="c.readiness ?? 0" />
          @if (!c.syllabus_summary) { <span class="chip bg-gold-soft self-start">Upload syllabus</span> }
        </a>
      } @empty {
        @if (!loading()) { <p class="muted">No courses yet. Click "New course" to add one.</p> }
      }
    </div>
  `,
})
export class CoursesPage {
  private api = inject(Api);
  private router = inject(Router);
  courses = signal<Course[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  error = signal('');
  code = '';
  name = '';
  term = 'Fall 2026';

  constructor() {
    this.api.courses()
      .then((c) => { this.courses.set(c); if (!c.length) this.showForm.set(true); })
      .catch((e) => this.error.set(errorText(e)))
      .finally(() => this.loading.set(false));
  }

  async create() {
    this.saving.set(true);
    try {
      const course = await this.api.createCourse({ code: this.code, name: this.name, term: this.term });
      this.router.navigate(['/courses', course.id]);
    } catch (e) {
      this.error.set(errorText(e));
      this.saving.set(false);
    }
  }
}
