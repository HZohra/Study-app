import { Component, ElementRef, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorText } from '../api';
import { ChatMessage } from '../models';
import { MarkdownPipe } from '../markdown.pipe';

// Ask questions about one lecture (lectureId set) or the whole course
@Component({
  selector: 'app-chat-panel',
  imports: [FormsModule, MarkdownPipe],
  template: `
    <div class="card flex flex-col gap-3 !p-0 overflow-hidden">
      <div class="flex items-center justify-between px-5 pt-4">
        <h3 class="font-bold">{{ lectureId() ? 'Ask about this lecture' : 'Ask about this course' }}</h3>
        @if (messages().length) {
          <button class="text-xs text-ink-soft hover:text-bad" (click)="clear()">Clear chat</button>
        }
      </div>

      <div #scroller class="flex flex-col gap-3 px-5 overflow-y-auto" [style.max-height]="height()">
        @if (!messages().length) {
          <p class="muted">Answers come from your slides, with slide numbers. Try:</p>
          <div class="flex flex-wrap gap-2">
            @for (s of suggestions(); track s) {
              <button class="chip bg-cobalt-soft text-cobalt hover:bg-cobalt hover:text-white text-left" (click)="send(s)">{{ s }}</button>
            }
          </div>
        }
        @for (m of messages(); track $index) {
          @if (m.role === 'user') {
            <div class="self-end max-w-[85%] rounded-2xl rounded-br-md bg-cobalt text-white px-4 py-2 text-sm whitespace-pre-wrap">{{ m.content }}</div>
          } @else {
            <div class="self-start max-w-[95%] rounded-2xl rounded-bl-md bg-paper border border-line px-4 py-3 prose-lesson !text-sm" [innerHTML]="m.content | markdown"></div>
          }
        }
        @if (thinking()) { <div class="self-start muted animate-pulse">Thinking…</div> }
        @if (error()) { <div class="error-box">{{ error() }}</div> }
      </div>

      <form class="flex gap-2 border-t border-line p-3" (ngSubmit)="send(draft)">
        <input class="input" name="q" [(ngModel)]="draft" placeholder="e.g. What's the difference between onPause and onStop?" [disabled]="thinking()">
        <button class="btn-primary" [disabled]="thinking() || !draft.trim()">Ask</button>
      </form>
    </div>
  `,
})
export class ChatPanel {
  private api = inject(Api);
  courseId = input.required<number>();
  lectureId = input<number | undefined>();
  height = input('420px');
  suggestions = input<string[]>(['Summarize the key ideas', 'What will likely be on the exam?', 'Give me an example']);

  messages = signal<ChatMessage[]>([]);
  thinking = signal(false);
  error = signal('');
  draft = '';
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Load history whenever the course / lecture changes
    effect(async () => {
      const courseId = this.courseId();
      const lectureId = this.lectureId();
      this.messages.set([]);
      try { this.messages.set(await this.api.chatHistory(courseId, lectureId)); this.scrollDown(); }
      catch (e) { this.error.set(errorText(e)); }
    });
  }

  async send(text: string) {
    const question = text.trim();
    if (!question || this.thinking()) return;
    this.draft = '';
    this.error.set('');
    this.messages.update((m) => [...m, { role: 'user', content: question }]);
    this.thinking.set(true);
    this.scrollDown();
    try {
      const { answer } = await this.api.ask(this.courseId(), question, this.lectureId());
      this.messages.update((m) => [...m, { role: 'assistant', content: answer }]);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.thinking.set(false);
      this.scrollDown();
    }
  }

  async clear() {
    await this.api.clearChat(this.courseId(), this.lectureId());
    this.messages.set([]);
  }

  private scrollDown() {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
