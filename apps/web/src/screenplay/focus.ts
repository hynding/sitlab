/** Where the caret goes after the next render: an element (by id) and an offset in its text. */
let pending: { id: string; caret: number } | null = null

/** Asks the element's field to take the caret once it renders (it may be new, or swap input for textarea). */
export function focusElement(id: string, caret: number): void {
  pending = { id, caret }
}

/** The caret offset if this element was asked to take focus; clears the request. */
export function takeFocus(id: string): number | null {
  if (pending?.id !== id) return null
  const { caret } = pending
  pending = null
  return caret
}
