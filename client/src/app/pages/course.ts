import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Api, errorText } from '../api';
import { CourseDetail, Progress } from '../models';
import { Meter } from '../shared/meter';
import { ChatPanel } from '../shared/chat-panel';
import { QuestionBank } from '../shared/question-bank';

type Tab = 'overview' | 'lectures' | 'quizzes' | 'progress' | 'chat';

@Component({
  selector: 'app-course',
  imports: [FormsModule, RouterLink, DatePipe, Meter, ChatPanel, QuestionBank],
  template: `
    @if (course(); as c) {
      <header class="mb-6">
        <a routerLink="/courses" class="muted hover:text-cobalt">← Courses</a>
        <p class="mt-3 text-sm font-semibold text-cobalt">{{ c.code }} @if (c.term) { · {{ c.term }} }</p>
        <h1 class="text-3xl font-extrabold">{{ c.name }}</h1>
      </header>

      <nav class="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        @for (t of tabs; track t.id) {
          <a [routerLink]="[]" [queryParams]="{ tab: t.id }"
             class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap"
             [class]="current() === t.id ? 'border-cobalt text-cobalt' : 'border-transparent text-ink-soft hover:text-ink'">{{ t.label }}</a>
        }
      </nav>

      @if (error()) { <div class="error-box mb-6">{{ error() }}</div> }

      @switch (current()) {
        @case ('overview') {
          <div class="grid gap-6 lg:grid-cols-[1fr_300px]">
            <section class="card">
              <h2 class="text-lg font-bold mb-2">Syllabus</h2>
              @if (c.syllabus_summary) {
                <p class="mb-4">{{ c.syllabus_summary }}</p>
                <ol class="divide-y divide-line">
                  @for (s of c.syllabus; track s.id) {
                    <li class="py-2 flex gap-4 text-sm">
                      <span class="w-16 shrink-0 font-semibold text-ink-soft">Week {{ s.week }}</span><span>{{ s.title }}</span>
                    </li>
                  }
                </ol>
              } @else {
                <p class="muted">Upload the syllabus once so the AI knows what's coming each week and can link topics across your classes.</p>
              }
            </section>
            <aside class="flex flex-col gap-4">
              <div class="card flex flex-col gap-3">
                <h3 class="font-bold">{{ c.syllabus_summary ? 'Replace syllabus' : 'Upload syllabus' }}</h3>
                <input type="file" accept="application/pdf" class="text-sm" (change)="syllabusFile = $any($event.target).files?.[0] ?? null">
                <button class="btn-primary" [disabled]="!syllabusFile || busy()" (click)="uploadSyllabus()">
                  {{ busy() ? 'Reading syllabus…' : 'Upload PDF' }}
                </button>
              </div>
              <div class="card flex flex-col gap-2 text-sm">
                <div class="flex justify-between"><span class="muted">Lectures</span><b>{{ c.lectures.length }}</b></div>
                <div class="flex justify-between"><span class="muted">Topics studied</span><b>{{ doneTopics() }} / {{ totalTopics() }}</b></div>
              </div>
              <button class="text-sm text-ink-soft hover:text-bad self-start" (click)="deleteCourse()">Delete course</button>
            </aside>
          </div>
        }
        @case ('lectures') {
          <div class="grid gap-6 lg:grid-cols-[1fr_300px]">
            <section class="flex flex-col gap-3">
              @for (l of c.lectures; track l.id) {
                <div class="card !p-4 flex items-center gap-4">
                  <span class="grid place-items-center size-10 shrink-0 rounded-xl bg-cobalt-soft text-cobalt font-display font-bold">{{ l.number }}</span>
                  <div class="min-w-0 flex-1">
                    @if (l.status === 'ready') {
                      <a [routerLink]="['/lectures', l.id]" class="font-semibold hover:text-cobalt">{{ l.title }}</a>
                      <p class="muted">{{ l.topics_done }} / {{ l.topic_count }} topics studied</p>
                    } @else if (l.status === 'error') {
                      <p class="font-semibold">{{ l.title }}</p>
                      <p class="text-sm text-bad truncate">Failed: {{ l.error }}</p>
                    } @else {
                      <p class="font-semibold">{{ l.title }}</p>
                      <p class="muted animate-pulse">Reading slides and finding topics…</p>
                    }
                  </div>
                  @if (l.status === 'ready') {
                    <div class="w-28 hidden sm:block"><app-meter [value]="l.topic_count ? (l.topics_done / l.topic_count) * 100 : 0" [showLabel]="false" tone="progress" /></div>
                  }
                  @if (l.status === 'error') { <button class="btn-ghost" (click)="reprocess(l.id)">Retry</button> }
                  <button class="text-ink-soft hover:text-bad text-sm" title="Delete lecture" (click)="deleteLecture(l.id)">✕</button>
                </div>
              } @empty {
                <div class="card muted">No lectures yet. Upload your first slide deck on the right.</div>
              }
            </section>
            <aside>
              <form class="card flex flex-col gap-3 lg:sticky lg:top-6" (ngSubmit)="uploadLecture()">
                <h3 class="font-bold">Add lecture</h3>
                <div><label class="label" for="lt">Title</label><input id="lt" class="input" name="title" [(ngModel)]="lectureTitle" placeholder="Activity Lifecycle"></div>
                <div><label class="label" for="ln">Number</label><input id="ln" class="input" name="number" type="number" [(ngModel)]="lectureNumber" [placeholder]="c.lectures.length + 1"></div>
                <div><label class="label" for="lf">Slides (PDF)</label><input id="lf" type="file" accept="application/pdf" class="text-sm" (change)="lectureFile = $any($event.target).files?.[0] ?? null"></div>
                <button class="btn-primary" [disabled]="!lectureFile || busy()">{{ busy() ? 'Uploading…' : 'Upload' }}</button>
                <p class="muted text-xs">Save PowerPoint slides as PDF first. Max 32 MB / 100 pages.</p>
              </form>
            </aside>
          </div>
        }
        @case ('quizzes') { <app-question-bank [courseId]="c.id" /> }
        @case ('progress') {
          @if (progress(); as p) {
            <div class="grid gap-6 lg:grid-cols-3">
              <section class="card lg:col-span-1 flex flex-col gap-3">
                <p class="label">Exam readiness</p>
                <p class="font-display text-6xl font-extrabold" [class]="p.readiness >= 80 ? 'text-good' : p.readiness >= 60 ? 'text-ink' : 'text-bad'">{{ p.readiness }}%</p>
                <app-meter [value]="p.readiness" [showLabel]="false" />
                <p class="muted">Average of your last 5 answers on every topic. Topics you haven't been quizzed on count as 0%.</p>
              </section>

              <section class="card lg:col-span-2">
                <h3 class="font-bold mb-3">Lectures</h3>
                <table class="w-full text-sm">
                  <thead><tr class="text-left text-ink-soft"><th class="py-1 font-medium">Lecture</th><th class="font-medium">Studied</th><th class="font-medium text-right">Avg quiz</th></tr></thead>
                  <tbody>
                    @for (l of p.lectures; track l.id) {
                      <tr class="border-t border-line">
                        <td class="py-2"><a [routerLink]="['/lectures', l.id]" class="hover:text-cobalt">{{ l.number }}. {{ l.title }}</a></td>
                        <td>{{ l.topics_done }} / {{ l.topic_count }} {{ l.topics_done === l.topic_count && l.topic_count ? '✓' : '' }}</td>
                        <td class="text-right font-semibold">{{ l.avg_quiz_score === null ? '–' : l.avg_quiz_score + '%' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>

              @for (group of groups(p); track group.label) {
                <section class="card">
                  <h3 class="font-bold mb-3">{{ group.label }} <span class="muted font-normal">({{ group.items.length }})</span></h3>
                  <div class="flex flex-col gap-2">
                    @for (t of group.items; track t.id) {
                      <a [routerLink]="['/lectures', t.lecture_id]" [queryParams]="{ topic: t.id }" class="text-sm hover:text-cobalt">
                        <div class="flex justify-between gap-2"><span class="truncate">L{{ t.lecture_number }} · {{ t.title }}</span></div>
                        @if (t.mastery !== null) { <app-meter [value]="t.mastery" /> }
                      </a>
                    } @empty { <p class="muted">None yet.</p> }
                  </div>
                </section>
              }

              @if (p.quizzes.length) {
                <section class="card lg:col-span-3">
                  <h3 class="font-bold mb-3">Quiz scores over time</h3>
                  <div class="flex items-end gap-2 h-40">
                    @for (q of p.quizzes; track q.id) {
                      <a [routerLink]="['/quizzes', q.id]" class="flex-1 max-w-12 flex flex-col items-center gap-1 h-full justify-end group"
                         [title]="q.title + ' · ' + (q.completed_at | date: 'MMM d') + ' · ' + q.score + '%'">
                        <span class="text-xs font-semibold">{{ q.score }}</span>
                        <div class="w-full rounded-t-md group-hover:opacity-80" [style.height.%]="q.score"
                             [class]="q.kind === 'practice' ? 'bg-gold' : 'bg-cobalt'"></div>
                      </a>
                    }
                  </div>
                  <p class="muted mt-2"><span class="inline-block size-2 rounded-full bg-cobalt"></span> Lecture quiz &nbsp; <span class="inline-block size-2 rounded-full bg-gold"></span> Practice exam</p>
                </section>
              }
            </div>
          } @else { <p class="muted">Loading…</p> }
        }
        @case ('chat') {
          <app-chat-panel [courseId]="c.id" height="60vh"
            [suggestions]="['What are the main themes of this course so far?', 'Which topics connect to each other?', 'Quiz me on something I might be weak on']" />
        }
      }
    } @else if (error()) {
      <div class="error-box">{{ error() }}</div>
    } @else { <p class="muted">Loading…</p> }
  `,
})
export class CoursePage {
  private api = inject(Api);
  private router = inject(Router);

  id = input.required<string>();      // from the route
  tab = input<string | undefined>();  // from ?tab=

  tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'lectures', label: 'Lectures' },
    { id: 'quizzes', label: 'Quiz Bank' },
    { id: 'progress', label: 'Progress' },
    { id: 'chat', label: 'Chat' },
  ];
  current = computed<Tab>(() => (this.tabs.some((t) => t.id === this.tab()) ? this.tab() as Tab : 'overview'));

  course = signal<CourseDetail | null>(null);
  progress = signal<Progress | null>(null);
  error = signal('');
  busy = signal(false);
  totalTopics = computed(() => this.course()?.lectures.reduce((s, l) => s + l.topic_count, 0) ?? 0);
  doneTopics = computed(() => this.course()?.lectures.reduce((s, l) => s + l.topics_done, 0) ?? 0);

  syllabusFile: File | null = null;
  lectureFile: File | null = null;
  lectureTitle = '';
  lectureNumber: number | null = null;

  private poll?: ReturnType<typeof setInterval>;

  constructor() {
    effect(() => { this.load(Number(this.id())); });
    effect(() => { if (this.current() === 'progress') this.loadProgress(); });
    inject(DestroyRef).onDestroy(() => clearInterval(this.poll));
  }

  async load(id: number) {
    try {
      const c = await this.api.course(id);
      this.course.set(c);
      // Keep checking while a lecture is being processed
      const pending = c.lectures.some((l) => l.status === 'processing' || l.status === 'uploaded');
      clearInterval(this.poll);
      if (pending) this.poll = setInterval(() => this.load(id), 3000);
    } catch (e) { this.error.set(errorText(e)); }
  }

  async loadProgress() {
    try { this.progress.set(await this.api.progress(Number(this.id()))); }
    catch (e) { this.error.set(errorText(e)); }
  }

  groups(p: Progress) {
    return [
      { label: 'Weak topics', items: p.weak },
      { label: 'Strong topics', items: p.strong },
      { label: 'Not quizzed yet', items: p.untested },
    ];
  }

  private async run(task: () => Promise<unknown>) {
    this.busy.set(true);
    this.error.set('');
    try { await task(); await this.load(Number(this.id())); }
    catch (e) { this.error.set(errorText(e)); }
    finally { this.busy.set(false); }
  }

  uploadSyllabus() {
    const file = this.syllabusFile;
    if (file) this.run(() => this.api.uploadSyllabus(Number(this.id()), file));
  }

  uploadLecture() {
    const file = this.lectureFile;
    if (!file) return;
    this.run(async () => {
      await this.api.uploadLecture(Number(this.id()), file, this.lectureTitle, this.lectureNumber ?? undefined);
      this.lectureFile = null;
      this.lectureTitle = '';
      this.lectureNumber = null;
      const input = document.getElementById('lf') as HTMLInputElement | null;
      if (input) input.value = '';
    });
  }

  reprocess(lectureId: number) { this.run(() => this.api.reprocessLecture(lectureId)); }

  deleteLecture(lectureId: number) {
    if (confirm('Delete this lecture, its lessons and its quiz questions?')) this.run(() => this.api.deleteLecture(lectureId));
  }

  async deleteCourse() {
    if (!confirm('Delete this course and everything in it?')) return;
    await this.api.deleteCourse(Number(this.id()));
    this.router.navigate(['/courses']);
  }
}
