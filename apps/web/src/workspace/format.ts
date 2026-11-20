/** Text helpers shared by the workspace sections. */

/** 'a-plot' → 'A plot', 'close-up' → 'Close up' */
export function label(value: string): string {
  const words = value.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** An empty input means "no value", which the API stores as null. */
export const orNull = (value: string): string | null => (value.trim() ? value.trim() : null)

/** The app routes on the hash, so a research chip scrolls to the Research section instead of linking. */
export function scrollToResearch(): void {
  document.getElementById('research')?.scrollIntoView({ behavior: 'smooth' })
}
