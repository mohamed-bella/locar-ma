// Minimal className joiner — truthy strings only. No runtime deps.
export type ClassValue = string | false | null | undefined
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ')
}
