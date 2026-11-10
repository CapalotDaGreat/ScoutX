import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The type scale uses named sizes (tailwind.config.js `fontSize`). tailwind-merge has to be told
 * about them: otherwise it reads `text-caption` as a colour and drops it whenever a real colour
 * class such as `text-foreground-secondary` follows, and the text falls back to the inherited size.
 */
const TYPE_SCALE = [
  'display-xl', 'display-lg', 'heading-1', 'heading-2', 'heading-3',
  'body-lg', 'body', 'body-sm', 'label', 'caption', 'overline',
  'stat-xl', 'stat-lg', 'stat-sm',
];

const merge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: TYPE_SCALE }] } },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
