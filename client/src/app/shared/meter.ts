import { Component, computed, input } from '@angular/core';

// Horizontal bar for readiness / mastery (red under 60, gold under 80, green above) or plain progress
@Component({
  selector: 'app-meter',
  template: `
    <div class="flex items-center gap-3">
      <div class="h-2.5 flex-1 rounded-full bg-paper border border-line overflow-hidden">
        <div class="h-full rounded-full transition-all" [class]="color()" [style.width.%]="value() ?? 0"></div>
      </div>
      @if (showLabel()) {
        <span class="w-11 text-right text-sm font-semibold tabular-nums">{{ value() === null ? '–' : value() + '%' }}</span>
      }
    </div>
  `,
})
export class Meter {
  value = input<number | null>(0);
  showLabel = input(true);
  // 'score' colors by how good the number is; 'progress' is always cobalt
  tone = input<'score' | 'progress'>('score');
  color = computed(() => {
    if (this.tone() === 'progress') return 'bg-cobalt';
    const v = this.value() ?? 0;
    return v >= 80 ? 'bg-good' : v >= 60 ? 'bg-gold' : 'bg-bad';
  });
}
