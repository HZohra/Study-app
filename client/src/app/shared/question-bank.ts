import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Api, errorText } from '../api';
import { BankQuestion, LectureSummary, Quiz } from '../models';

// Saved questions for one course + the practice exam builder
@Component({
  selector: 'app-question-bank',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="grid gap-6 lg:grid-cols-[1fr_320px]">
      <!-- Question list -->
      <section class="flex flex-col gap-4 min-w-0">
        <div class="flex flex-wrap items-center gap-3">
          <h3 class="text-lg font-bold mr-auto">{{ questions().length }} saved questions</h3>
          <select class="input !w-auto" [(ngModel)]="filter" (ngModelChange)="load()">
            <option [ngValue]="0">All lectures</option>
            @for (l of lectures(); track l.id) { <option [ngValue]="l.id">Lecture {{ l.number }}</option> }
          </select>
        </div>

        @if (error()) { <div class="error-box">{{ error() }}</div> }
        @if (!questions().length && !loading()) {
          <div class="card muted">No questions yet. Open a lecture and take its quiz; every question is saved here.</div>
        }

        @for (q of questions(); track q.id) {
          <article class="card !p-4">
            <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
              <span class="chip bg-paper border border-line">Lecture {{ q.lecture_number }}</span>
              @if (q.topic_title) { <span class="chip bg-cobalt-soft text-cobalt">{{ q.topic_title }}</span> }
              <span class="chip bg-gold-soft">{{ q.difficulty }}</span>
              <span class="ml-auto text-ink-soft">
                @if (q.times_answered) { {{ q.times_correct }}/{{ q.times_answered }} correct } @else { not tried yet }
              </span>
            </div>
            <p class="font-medium">{{ q.prompt }}</p>
            @if (open().has(q.id)) {
              <ol class="mt-3 flex flex-col gap-1 text-sm">
                @for (o of q.options; track $index) {
                  <li class="rounded-lg px-3 py-1.5" [class]="$index === q.correct_index ? 'bg-good-soft text-good font-semibold' : 'bg-paper'">
                    {{ 'ABCD'[$index] }}. {{ o }}
                  </li>
                }
              </ol>
              <p class="mt-3 text-sm text-ink-soft">{{ q.explanation }}</p>
            }
            <div class="mt-3 flex gap-3 text-sm">
              <button class="text-cobalt font-medium" (click)="toggle(q.id)">{{ open().has(q.id) ? 'Hide answer' : 'Show answer' }}</button>
              <button class="text-ink-soft hover:text-bad ml-auto" (click)="remove(q)">Remove</button>
            </div>
          </article>
        }
      </section>

      <!-- Practice exam builder -->
      <aside class="flex flex-col gap-4">
        <div class="card flex flex-col gap-4 lg:sticky lg:top-6">
          <div>
            <h3 class="text-lg font-bold">Practice exam</h3>
            <p class="muted">Built from your saved questions, with weak topics and missed questions first. Instant and free.</p>
          </div>
          <div>
            <span class="label">Lectures</span>
            <label class="flex items-center gap-2 text-sm py-1">
              <input type="checkbox" [checked]="!picked().size" (change)="picked.set(emptySet())"> All lectures (final exam)
            </label>
            @for (l of lectures(); track l.id) {
              <label class="flex items-center gap-2 text-sm py-1">
                <input type="checkbox" [checked]="picked().has(l.id)" (change)="togglePick(l.id)"> Lecture {{ l.number }}: {{ l.title }}
              </label>
            }
          </div>
          <div>
            <label class="label" for="count">Number of questions</label>
            <input id="count" class="input" type="number" min="5" max="100" [(ngModel)]="count">
          </div>
          <button class="btn-gold" [disabled]="!questions().length || starting()" (click)="startPractice()">
            {{ starting() ? 'Building…' : 'Start practice exam' }}
          </button>
        </div>

        @if (history().length) {
          <div class="card">
            <h3 class="font-bold mb-2">Past quizzes</h3>
            <ul class="flex flex-col divide-y divide-line text-sm">
              @for (z of history(); track z.id) {
                <li class="py-2 flex items-center gap-2">
                  <a [routerLink]="['/quizzes', z.id]" class="hover:text-cobalt truncate mr-auto">{{ z.title }}</a>
                  @if (z.completed_at) {
                    <span class="font-semibold tabular-nums" [class]="(z.score ?? 0) >= 80 ? 'text-good' : (z.score ?? 0) >= 60 ? 'text-ink' : 'text-bad'">{{ z.score }}%</span>
                  } @else { <span class="text-ink-soft">{{ z.created_at | date: 'MMM d' }} · unfinished</span> }
                </li>
              }
            </ul>
          </div>
        }
      </aside>
    </div>
  `,
})
export class QuestionBank {
  private api = inject(Api);
  private router = inject(Router);
  courseId = input.required<number>();

  lectures = signal<LectureSummary[]>([]);
  questions = signal<BankQuestion[]>([]);
  history = signal<Quiz[]>([]);
  open = signal(new Set<number>());
  picked = signal(new Set<number>());
  loading = signal(true);
  starting = signal(false);
  error = signal('');
  filter = 0;
  count = 20;
  emptySet = () => new Set<number>();

  constructor() {
    effect(async () => {
      const id = this.courseId();
      this.filter = 0;
      this.picked.set(new Set());
      try {
        const [course, quizzes] = await Promise.all([this.api.course(id), this.api.quizzes(id)]);
        this.lectures.set(course.lectures.filter((l) => l.status === 'ready'));
        this.history.set(quizzes);
        await this.load();
      } catch (e) { this.error.set(errorText(e)); }
    });
  }

  async load() {
    this.loading.set(true);
    try { this.questions.set(await this.api.questionBank(this.courseId(), this.filter || undefined)); }
    catch (e) { this.error.set(errorText(e)); }
    finally { this.loading.set(false); }
  }

  toggle(id: number) {
    this.open.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  togglePick(id: number) {
    this.picked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async remove(q: BankQuestion) {
    if (!confirm('Remove this question from the bank?')) return;
    await this.api.deleteQuestion(q.id);
    this.questions.update((list) => list.filter((x) => x.id !== q.id));
  }

  async startPractice() {
    this.starting.set(true);
    this.error.set('');
    try {
      const quiz = await this.api.newPractice(this.courseId(), { lectureIds: [...this.picked()], count: this.count });
      this.router.navigate(['/quizzes', quiz.id]);
    } catch (e) {
      this.error.set(errorText(e));
      this.starting.set(false);
    }
  }
}
