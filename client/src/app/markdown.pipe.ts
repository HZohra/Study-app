import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

// Renders markdown from Claude. Angular's [innerHTML] binding sanitizes the
// resulting HTML, so scripts or unsafe attributes are stripped.
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? (marked.parse(value, { async: false, gfm: true }) as string) : '';
  }
}
