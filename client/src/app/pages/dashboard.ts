import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Api, errorText } from '../api';
import { Dashboard } from '../models';
import { Meter } from '../shared/meter';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, Meter],
  template: `
    <header class="mb-8">
      <p class="label">{{ today | date: 'EEEE, MMMM d' }}</p>
      <h1 class="text-3xl md:text-4xl font-extrabold">Ready to study?</h1>
    </header>

    @if (error()) { <div class="error-box mb-6">{{ error() }}</div> }

    @if (data(); as d) {
      @if (!d.courses.length) {
        <div class="card text-center py-12">
          <h2 class="text-xl font-bold mb-2">Add your first course</h2>
          <p class="muted mb-5">Create a course, upload its syllabus, then add lecture slides.</p>
          <a routerLink="/courses" class="btn-primary">Go to Courses</a>
        </div>
      }

      <div class="grid gap-5 md:grid-cols-2">
        @for (c of d.courses; track c.id) {
          <article class="card flex flex-col gap-4">
            <a [routerLink]="['/courses', c.id]" class="group">
              <p class="text-xs font-semibold text-cobalt">{{ c.code }}</p>
              <h2 class="text-xl font-bold group-hover:text-cobalt">{{ c.name }}</h2>
            </a>
            <div>
              <div class="flex justify-between text-sm mb-1"><span class="muted">Exam readiness</span></div>
              <app-meter [value]="c.readiness" />
              <p class="muted mt-1">{{ c.topics_done }} of {{ c.topic_count }} topics studied</p>
            </div>
            @if (c.weak.length) {
              <div>
                <p class="label">Review these</p>
                <div class="flex flex-wrap gap-2">
                  @for (t of c.weak; track t.id) {
                    <a [routerLink]="['/lectures', t.lecture_id]" [queryParams]="{ topic: t.id }" class="chip bg-bad-soft text-bad">{{ t.title }} · {{ t.mastery }}%</a>
                  }
                </div>
              </div>
            }
            <div class="mt-auto flex gap-2">
              @if (c.next) {
                <a [routerLink]="['/lectures', c.next.lecture_id]" [queryParams]="{ topic: c.next.id }" class="btn-primary">
                  Continue: {{ c.next.title }}
                </a>
              } @else {
                <a [routerLink]="['/courses', c.id]" [queryParams]="{ tab: 'lectures' }" class="btn-primary">Add a lecture</a>
              }
              <a [routerLink]="['/courses', c.id]" [queryParams]="{ tab: 'progress' }" class="btn-ghost">Progress</a>
            </div>
          </article>
        }
      </div>

      @if (d.recentQuizzes.length) {
        <section class="mt-10">
          <h2 class="text-lg font-bold mb-3">Recent quizzes</h2>
          <div class="card !p-0 divide-y divide-line">
            @for (q of d.recentQuizzes; track q.id) {
              <a [routerLink]="['/quizzes', q.id]" class="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                <span class="mr-auto">{{ q.title }}</span>
                <span class="muted">{{ q.completed_at | date: 'MMM d' }}</span>
                <span class="w-12 text-right font-semibold" [class]="q.score >= 80 ? 'text-good' : q.score >= 60 ? '' : 'text-bad'">{{ q.score }}%</span>
              </a>
            }
          </div>
        </section>
      }
    } @else if (!error()) {
      <p class="muted">Loading…</p>
    }
  `,
})
export class DashboardPage {
  private api = inject(Api);
  data = signal<Dashboard | null>(null);
  error = signal('');
  today = new Date();

  constructor() {
    this.api.dashboard().then((d) => this.data.set(d)).catch((e) => this.error.set(errorText(e)));
  }
}
