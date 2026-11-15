/** Small form pieces shared by the workspace sections. */
import { label } from './format'

export function Choice<T extends string>({
  value,
  options,
  onChange,
  empty,
  ...rest
}: {
  value: T | null
  options: readonly T[]
  onChange: (value: T | null) => void
  /** Offers a blank choice, for an optional field. */
  empty?: string
  'aria-label'?: string
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as T | null)} {...rest}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  )
}
