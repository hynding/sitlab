import type { Element } from './elements'

/** A scene body laid out as a screenplay page, for reading and printing. */
export function ScriptView({ elements }: { elements: Element[] }) {
  return (
    <>
      {elements
        .filter((el) => el.text.trim())
        .map((el) => (
          <div key={el.id} className={`sp-el sp-${el.type}`}>
            <p>{el.type === 'parenthetical' ? `(${el.text.trim().replace(/^\(|\)$/g, '')})` : el.text.trim()}</p>
          </div>
        ))}
    </>
  )
}
