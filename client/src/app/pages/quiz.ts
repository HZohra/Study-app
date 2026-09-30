import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorText } from '../api';
import { Quiz, QuizQuestion } from '../models';
import { Meter } from '../shared/meter';

@Component({
  selector: 'app-quiz',
  imports: [RouterLink, Meter],
  template: `
    @if (quiz(); as z) {
      <header class="mb-6">
        <a [routerLink]="backLink()" [queryParams]="z.lecture_id ? {} : { tab: 'quizzes' }" class="muted hover:text-cobalt">← Back</a>
        <h1 class="mt-3 text-3xl font-extrabold">{{ z.title }}</h1>
      </header>
      @if (error()) { <div class="error-box mb-6">{{ error() }}</div> }

      @if (!z.completed_at) {
        <!-- Taking the quiz: one question at a time -->
        @if (current(); as q) {
          <div class="mb-4 flex items-center gap-3 text-sm">
            <span class="font-semibold">Question {{ index() + 1 }} of {{ z.questions.length }}</span>
            <div class="flex-1"><app-meter [value]="(answeredCount() / z.questions.length) * 100" [showLabel]="false" tone="progress" /></div>
            <span class="muted">{{ correctCount() }} correct</span>
          </div>

          <article class="card md:!p-8 max-w-3xl">
            <div class="flex gap-2 mb-3">
              @if (q.topic_title) { <span class="chip bg-cobalt-soft text-cobalt">{{ q.topic_title }}</span> }
              <span class="chip bg-gold-soft">{{ q.difficulty }}</span>
            </div>
            <h2 class="text-lg font-semibold font-sans mb-5 whitespace-pre-wrap">{{ q.prompt }}</h2>

            <div class="flex flex-col gap-2">
              @for (o of q.options; track $index) {
                <button class="text-left rounded-xl border px-4 py-3 transition disabled:cursor-default"
                        [class]="optionClass(q, $index)" [disabled]="q.chosen_index !== null || sending()" (click)="choose(q, $index)">
                  <span class="font-semibold mr-2">{{ 'ABCD'[$index] }}.</span>{{ o }}
                </button>
              }
            </div>

            @if (q.chosen_index !== null) {
              <div class="mt-5 rounded-xl p-4 text-sm" [class]="q.is_correct ? 'bg-good-soft' : 'bg-bad-soft'">
                <p class="font-semibold mb-1" [class]="q.is_correct ? 'text-good' : 'text-bad'">{{ q.is_correct ? 'Correct!' : 'Not quite.' }}</p>
                <p>{{ q.explanation }}</p>
              </div>
              <div class="mt-5 flex justify-end">
                @if (index() < z.questions.length - 1) {
                  <button class="btn-primary" (click)="index.set(index() + 1)">Next question →</button>
                } @else {
                  <button class="btn-gold" [disabled]="sending()" (click)="finish()">See my results</button>
                }
              </div>
            }
          </article>
        }
      } @else {
        <!-- Results and review -->
        <section class="card mb-6 flex flex-wrap items-center gap-6">
          <p class="font-display text-6xl font-extrabold" [class]="(z.score ?? 0) >= 80 ? 'text-good' : (z.score ?? 0) >= 60 ? 'text-ink' : 'text-bad'">{{ z.score }}%</p>
          <div class="mr-auto">
            <p class="font-semibold">{{ correctCount() }} of {{ z.questions.length }} correct</p>
            <p class="muted">{{ message() }}</p>
          </div>
          <a [routerLink]="['/courses', z.course_id]" [queryParams]="{ tab: 'progress' }" class="btn-ghost">See course progress</a>
        </section>

        <h2 class="text-lg font-bold mb-3">Review</h2>
        <div class="flex flex-col gap-3">
          @for (q of z.questions; track q.id) {
            <article class="card !p-4" [class]="q.is_correct ? '' : '!border-bad/40'">
              <div class="flex gap-2 mb-2 text-xs">
                <span class="chip" [class]="q.is_correct ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'">{{ q.is_correct ? 'Correct' : q.chosen_index === null ? 'Skipped' : 'Wrong' }}</span>
                @if (q.topic_title) { <span class="chip bg-cobalt-soft text-cobalt">{{ q.topic_title }}</span> }
              </div>
              <p class="font-medium mb-2">{{ q.prompt }}</p>
              <ol class="flex flex-col gap-1 text-sm">
                @for (o of q.options; track $index) {
                  <li class="rounded-lg px-3 py-1.5"
                      [class]="$index === q.correct_index ? 'bg-good-soft text-good font-semibold' : $index === q.chosen_index ? 'bg-bad-soft text-bad line-through' : 'bg-paper'">
                    {{ 'ABCD'[$index] }}. {{ o }}
                  </li>
                }
              </ol>
              <p class="mt-2 text-sm text-ink-soft">{{ q.explanation }}</p>
            </article>
          }
        </div>
      }
    } @else if (error()) {
      <div class="error-box">{{ error() }}</div>
    } @else { <p class="muted">Loading…</p> }
  `,
})
export class QuizPage {
  private api = inject(Api);
  id = input.required<string>();

  quiz = signal<Quiz | null>(null);
  index = signal(0);
  sending = signal(false);
  error = signal('');

  current = computed(() => this.quiz()?.questions[this.index()] ?? null);
  answeredCount = computed(() => this.quiz()?.questions.filter((q) => q.chosen_index !== null).length ?? 0);
  correctCount = computed(() => this.quiz()?.questions.filter((q) => q.is_correct).length ?? 0);
  backLink = computed(() => {
    const z = this.quiz();
    return z?.lecture_id ? ['/lectures', z.lecture_id] : ['/courses', z?.course_id];
  });
  message = computed(() => {
    const s = this.quiz()?.score ?? 0;
    if (s >= 90) return 'Excellent. You know this material well.';
    if (s >= 75) return 'Solid. Review the questions you missed below.';
    if (s >= 60) return 'Getting there. Reread the lessons for the topics you missed.';
    return 'Worth another pass through these topics before the exam.';
  });

  constructor() {
    effect(async () => {
      try {
        const z = await this.api.quiz(Number(this.id()));
        this.quiz.set(z);
        const firstOpen = z.questions.findIndex((q) => q.chosen_index === null); // resume where you left off
        this.index.set(firstOpen === -1 ? z.questions.length - 1 : firstOpen);
      } catch (e) { this.error.set(errorText(e)); }
    });
  }

  optionClass(q: QuizQuestion, i: number) {
    if (q.chosen_index === null) return 'border-line bg-card hover:border-cobalt hover:bg-cobalt-soft';
    if (i === q.correct_index) return 'border-good bg-good-soft text-good font-medium';
    if (i === q.chosen_index) return 'border-bad bg-bad-soft text-bad';
    return 'border-line bg-card opacity-60';
  }

  async choose(q: QuizQuestion, i: number) {
    this.sending.set(true);
    try {
      const r = await this.api.answer(this.quiz()!.id, q.id, i);
      this.quiz.update((z) => z && {
        ...z,
        questions: z.questions.map((x) => (x.id === q.id
          ? { ...x, chosen_index: i, is_correct: r.isCorrect, correct_index: r.correctIndex, explanation: r.explanation }
          : x)),
      });
    } catch (e) { this.error.set(errorText(e)); }
    finally { this.sending.set(false); }
  }

  async finish() {
    this.sending.set(true);
    try {
      await this.api.finishQuiz(this.quiz()!.id);
      this.quiz.set(await this.api.quiz(this.quiz()!.id));
      window.scrollTo({ top: 0 });
    } catch (e) { this.error.set(errorText(e)); }
    finally { this.sending.set(false); }
  }
}
