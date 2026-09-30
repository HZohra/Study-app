import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, errorText } from '../api';
import { Lecture, Topic } from '../models';
import { MarkdownPipe } from '../markdown.pipe';
import { ChatPanel } from '../shared/chat-panel';
import { Meter } from '../shared/meter';

@Component({
  selector: 'app-lecture',
  imports: [RouterLink, MarkdownPipe, ChatPanel, Meter],
  template: `
    @if (lecture(); as l) {
      <header class="mb-6">
        <a [routerLink]="['/courses', l.course_id]" [queryParams]="{ tab: 'lectures' }" class="muted hover:text-cobalt">← {{ l.course_code }} {{ l.course_name }}</a>
        <h1 class="mt-3 text-3xl font-extrabold">Lecture {{ l.number }} – {{ l.title }}</h1>
        @if (l.summary) { <p class="muted mt-1 max-w-3xl">{{ l.summary }}</p> }
      </header>

      @if (error()) { <div class="error-box mb-6">{{ error() }}</div> }

      @if (l.status !== 'ready') {
        <div class="card">
          @if (l.status === 'error') { <p class="text-bad">Processing failed: {{ l.error }}</p> }
          @else { <p class="animate-pulse">Reading the slides and finding topics… this takes about a minute.</p> }
        </div>
      } @else {
        <div class="grid gap-6 lg:grid-cols-[280px_1fr]">
          <!-- Topic list -->
          <aside class="flex flex-col gap-4">
            <div class="card !p-4 lg:sticky lg:top-6">
              <p class="label">Topics</p>
              <ul class="flex flex-col gap-1 mb-4">
                @for (t of l.topics; track t.id) {
                  <li>
                    <button class="w-full flex items-start gap-2 rounded-lg px-2 py-2 text-left text-sm"
                            [class]="t.id === selected()?.id ? 'bg-cobalt-soft text-cobalt font-semibold' : 'hover:bg-paper'"
                            (click)="select(t.id)">
                      <span class="mt-0.5 grid place-items-center size-4 shrink-0 rounded border text-[10px]"
                            [class]="t.completed ? 'bg-good border-good text-white' : 'border-line'">{{ t.completed ? '✓' : '' }}</span>
                      <span>{{ t.title }}</span>
                    </button>
                  </li>
                }
              </ul>
              <p class="muted mb-1">Progress: {{ done() }} / {{ l.topics.length }} topics</p>
              <app-meter [value]="l.topics.length ? (done() / l.topics.length) * 100 : 0" [showLabel]="false" tone="progress" />
              <button class="btn-gold w-full mt-4" [disabled]="makingQuiz()" (click)="startQuiz()">
                {{ makingQuiz() ? 'Writing your quiz…' : 'Start lecture quiz' }}
              </button>
              <p class="muted text-xs mt-2">2 new questions per topic. They're saved to your Quiz Bank.</p>
            </div>
          </aside>

          <!-- Lesson -->
          <section class="flex flex-col gap-6 min-w-0">
            @if (selected(); as t) {
              <article class="card md:!p-8">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="chip bg-paper border border-line">Topic {{ t.position }} of {{ l.topics.length }}</span>
                  <span class="chip bg-paper border border-line">Slides {{ t.slides }}</span>
                </div>
                <h2 class="text-2xl font-bold mt-2">{{ t.title }}</h2>
                <p class="muted mb-6">{{ t.summary }}</p>

                @if (t.lesson_md) {
                  <div class="prose-lesson" [innerHTML]="t.lesson_md | markdown"></div>
                } @else if (teaching()) {
                  <p class="animate-pulse">Writing your lesson from the slides…</p>
                } @else {
                  <button class="btn-primary" (click)="learn(t)">Learn this topic</button>
                }

                @if (t.lesson_md) {
                  <div class="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
                    @if (!t.completed) {
                      <button class="btn-primary" (click)="markDone(t, true)">{{ next() ? 'Got it, next topic →' : 'Got it ✓' }}</button>
                    } @else {
                      <button class="btn-ghost" (click)="markDone(t, false)">Mark as not learned</button>
                      @if (next(); as n) { <button class="btn-primary" (click)="select(n.id)">Next: {{ n.title }} →</button> }
                    }
                    <button class="btn-ghost ml-auto" [disabled]="teaching()" (click)="learn(t, true)">Rewrite lesson</button>
                  </div>
                }
              </article>

              <div class="grid gap-4 md:grid-cols-2">
                <div class="card">
                  <h3 class="font-bold mb-2">Related courses</h3>
                  @for (r of t.related; track $index) {
                    <p class="text-sm py-1">
                      <span class="chip mr-1" [class]="r.relation === 'covered' ? 'bg-good-soft text-good' : 'bg-gold-soft'">{{ r.relation === 'covered' ? 'Also in' : 'Will appear in' }}</span>
                      {{ r.course_code }} – {{ r.where }}
                    </p>
                  } @empty { <p class="muted">Not linked to your other courses yet.</p> }
                </div>
                <div class="card">
                  <h3 class="font-bold mb-2">Beyond the course</h3>
                  <p class="muted mb-2">{{ t.title }} is commonly used with:</p>
                  <div class="flex flex-wrap gap-2">
                    @for (b of t.beyond; track b) { <span class="chip bg-cobalt-soft text-cobalt font-mono">{{ b }}</span> }
                  </div>
                </div>
              </div>
            }

            <app-chat-panel [courseId]="l.course_id" [lectureId]="l.id"
              [suggestions]="chatIdeas()" />
          </section>
        </div>
      }
    } @else if (error()) {
      <div class="error-box">{{ error() }}</div>
    } @else { <p class="muted">Loading…</p> }
  `,
})
export class LecturePage {
  private api = inject(Api);
  private router = inject(Router);

  id = input.required<string>();
  topic = input<string | undefined>(); // ?topic=

  lecture = signal<Lecture | null>(null);
  selectedId = signal<number | null>(null);
  teaching = signal(false);
  makingQuiz = signal(false);
  error = signal('');

  selected = computed(() => this.lecture()?.topics.find((t) => t.id === this.selectedId()) ?? null);
  done = computed(() => this.lecture()?.topics.filter((t) => t.completed).length ?? 0);
  next = computed(() => {
    const topics = this.lecture()?.topics ?? [];
    const i = topics.findIndex((t) => t.id === this.selectedId());
    return i >= 0 ? topics[i + 1] ?? null : null;
  });
  chatIdeas = computed(() => {
    const t = this.selected();
    return t
      ? [`Explain ${t.title} more simply`, `Give me a code example of ${t.title}`, 'What could be asked about this on the exam?']
      : ['Summarize this lecture'];
  });

  private poll?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => { this.load(Number(this.id())); });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.poll));
  }

  async load(id: number) {
    try {
      const l = await this.api.lecture(id);
      this.lecture.set(l);
      if (l.status === 'processing' || l.status === 'uploaded') {
        this.poll = setTimeout(() => this.load(id), 3000);
        return;
      }
      // Open the topic from the URL, else the first unfinished one
      const wanted = Number(this.topic());
      const start = l.topics.find((t) => t.id === wanted) ?? l.topics.find((t) => !t.completed) ?? l.topics[0];
      if (start) this.select(start.id);
    } catch (e) { this.error.set(errorText(e)); }
  }

  async select(topicId: number) {
    this.selectedId.set(topicId);
    this.router.navigate([], { queryParams: { topic: topicId }, replaceUrl: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Saved lessons load instantly; new ones wait for the "Learn" click
    const t = this.selected();
    if (t?.has_lesson && !t.lesson_md) this.learn(t);
  }

  async learn(t: Topic, force = false) {
    this.teaching.set(true);
    this.error.set('');
    if (force) this.patchTopic(t.id, { lesson_md: null });
    try {
      const saved = await this.api.lesson(t.id, force);
      this.patchTopic(t.id, { lesson_md: saved.lesson_md, has_lesson: true });
    } catch (e) { this.error.set(errorText(e)); }
    finally { this.teaching.set(false); }
  }

  async markDone(t: Topic, completed: boolean) {
    await this.api.setTopicDone(t.id, completed);
    this.patchTopic(t.id, { completed });
    const n = this.next();
    if (completed && n) this.select(n.id);
  }

  async startQuiz() {
    const l = this.lecture();
    if (!l) return;
    this.makingQuiz.set(true);
    this.error.set('');
    try {
      const quiz = await this.api.newLectureQuiz(l.id);
      this.router.navigate(['/quizzes', quiz.id]);
    } catch (e) {
      this.error.set(errorText(e));
      this.makingQuiz.set(false);
    }
  }

  private patchTopic(id: number, changes: Partial<Topic>) {
    this.lecture.update((l) => l && { ...l, topics: l.topics.map((t) => (t.id === id ? { ...t, ...changes } : t)) });
  }
}
