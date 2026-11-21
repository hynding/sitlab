import { useState } from 'react'
import { previewUrl, shots, uploadFiles, type Media, type StoryboardFrame } from '../cms'
import { describe } from '../errors'
import { useWorkspace } from './context'
import { moved } from './edit'
import { Choice } from './fields'
import { label } from './format'

/** A scene's storyboard as a strip of frames: image, shot and caption. */
export function StoryboardStrip({ frames }: { frames: StoryboardFrame[] }) {
  const { backend } = useWorkspace()
  if (frames.length === 0) return null
  return (
    <ol className="storyboard" aria-label="Storyboard">
      {frames.map((f, i) => (
        <li key={f.id ?? i} className="frame">
          {f.image ? (
            <img src={previewUrl(backend, f.image)} alt={f.image.alternativeText ?? f.caption ?? `Frame ${i + 1}`} loading="lazy" />
          ) : (
            <div className="frame-blank" aria-hidden="true">
              {i + 1}
            </div>
          )}
          <div className="frame-text">
            {f.shot && <span className="tag">{label(f.shot)}</span>} {f.caption}
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * Edits a storyboard inside the scene form. Images upload as soon as they are chosen, so the frames
 * can show them; `uploaded` collects those files so the form can delete the ones it never saves.
 */
export function StoryboardEditor({
  frames,
  onChange,
  onUploaded,
}: {
  frames: StoryboardFrame[]
  onChange: (frames: StoryboardFrame[]) => void
  onUploaded: (files: Media[]) => void
}) {
  const { backend } = useWorkspace()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setFrame = (i: number, patch: Partial<StoryboardFrame>) => onChange(frames.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  async function upload(list: FileList | null): Promise<Media[]> {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return []
    setUploading(true)
    setError(null)
    try {
      const media = await uploadFiles(backend, files)
      onUploaded(media)
      return media
    } catch (e) {
      setError(describe(e, backend))
      return []
    } finally {
      setUploading(false)
    }
  }

  return (
    <fieldset>
      <legend>Storyboard</legend>
      {frames.map((f, i) => (
        <div className="frame-edit" key={f.id ?? `new-${i}-${f.image?.id ?? ''}`}>
          {f.image ? (
            <img src={previewUrl(backend, f.image)} alt="" className="thumb" />
          ) : (
            <div className="thumb frame-blank" aria-hidden="true">
              {i + 1}
            </div>
          )}
          <div className="grow stacked-fields">
            <div className="row">
              <span className="muted">{i + 1}.</span>
              <Choice aria-label="Shot" value={f.shot} options={shots} empty="Shot…" onChange={(shot) => setFrame(i, { shot })} />
              <label className="file-button">
                {f.image ? 'Replace image' : 'Add image'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const input = e.currentTarget
                    void upload(input.files).then(([image]) => {
                      if (image) setFrame(i, { image })
                      input.value = ''
                    })
                  }}
                />
              </label>
              {f.image && (
                <button type="button" className="link" onClick={() => setFrame(i, { image: null })}>
                  Clear image
                </button>
              )}
            </div>
            <div className="row">
              <input aria-label="Caption" className="grow" placeholder="Caption" value={f.caption ?? ''} onChange={(e) => setFrame(i, { caption: e.target.value })} />
              <button type="button" className="link" disabled={i === 0} onClick={() => onChange(moved(frames, i, -1))} aria-label="Move frame up">
                ↑
              </button>
              <button
                type="button"
                className="link"
                disabled={i === frames.length - 1}
                onClick={() => onChange(moved(frames, i, 1))}
                aria-label="Move frame down"
              >
                ↓
              </button>
              <button type="button" className="link" onClick={() => onChange(frames.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <label className="file-button">
          {uploading ? 'Uploading…' : 'Add frames from images'}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => {
              const input = e.currentTarget
              void upload(input.files).then((media) => {
                if (media.length) onChange([...frames, ...media.map((image) => ({ caption: null, shot: null, image }))])
                input.value = ''
              })
            }}
          />
        </label>
        <button type="button" className="secondary" onClick={() => onChange([...frames, { caption: null, shot: null, image: null }])}>
          Add blank frame
        </button>
      </div>
    </fieldset>
  )
}
