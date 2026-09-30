import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen md:flex">
      <!-- Sidebar (top bar on phones) -->
      <aside class="md:w-60 md:min-h-screen md:border-r border-b md:border-b-0 border-line bg-card md:sticky md:top-0 md:h-screen">
        <div class="flex md:flex-col items-center md:items-stretch gap-2 md:gap-1 p-4">
          <a routerLink="/" class="flex items-center gap-2 mr-auto md:mr-0 md:mb-6">
            <span class="grid place-items-center size-9 rounded-xl bg-cobalt text-gold font-display font-extrabold">T</span>
            <span class="font-display font-bold text-lg hidden sm:inline">Trackr <span class="text-cobalt">Study</span></span>
          </a>
          @for (item of nav; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="!bg-cobalt-soft !text-cobalt"
               [routerLinkActiveOptions]="{ exact: item.path === '/' }"
               class="rounded-xl px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper hover:text-ink">
              {{ item.label }}
            </a>
          }
        </div>
      </aside>

      <main class="flex-1 min-w-0 px-4 py-6 md:px-10 md:py-10">
        <div class="mx-auto max-w-6xl">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
})
export class App {
  nav = [
    { path: '/', label: 'Dashboard' },
    { path: '/courses', label: 'Courses' },
    { path: '/question-bank', label: 'Question Bank' },
  ];
}
