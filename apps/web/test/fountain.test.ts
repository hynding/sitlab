import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromFountain, readHeading, toFountain } from '../src/workspace/fountain.ts'

const script = `Title: **The Lighthouse**
Credit: Written by
Author: Someone
Draft date: 2026-11-20

FADE IN:

EXT. LIGHTHOUSE - NIGHT #1#

= Ada arrives in the storm.

Waves hammer the rocks.

ADA
(shouting)
Hello?

.FLASHBACK

[[a note]]

int. keeper's room - morning

BEN (V.O.)
She came back.

> FADE OUT.
`

test('reads scenes, synopses and the title from a Fountain file', () => {
  const { title, scenes } = fromFountain(script)
  assert.equal(title, 'The Lighthouse')
  assert.deepEqual(
    scenes.map((s) => [s.title, s.location, s.timeOfDay, s.summary]),
    [
      ['Lighthouse', 'EXT. LIGHTHOUSE', 'night', 'Ada arrives in the storm.'],
      ['Flashback', 'FLASHBACK', null, null],
      ["Keeper's Room", "INT. KEEPER'S ROOM", 'dawn', null],
    ],
  )
  assert.equal(scenes[0].screenplay, 'FADE IN:\n\nWaves hammer the rocks.\n\nADA\n(shouting)\nHello?')
  assert.equal(scenes[1].screenplay, '[[a note]]')
  assert.equal(scenes[2].screenplay, 'BEN (V.O.)\nShe came back.\n\n> FADE OUT.')
})

test('a file with no headings becomes one scene', () => {
  assert.deepEqual(fromFountain('Just some action.').scenes.map((s) => s.screenplay), ['Just some action.'])
  assert.deepEqual(fromFountain('').scenes, [])
})

test('keeps a time of day it has no choice for in the location', () => {
  assert.deepEqual(readHeading('INT. HOUSE - LATER'), { title: 'House - Later', location: 'INT. HOUSE - LATER', timeOfDay: null })
})

test('export then import gives back the scenes', () => {
  const { scenes } = fromFountain(script)
  const story = { title: 'The Lighthouse', logline: null, scenes: scenes.map((s, i) => ({ ...s, position: i })) }
  const again = fromFountain(toFountain(story as never))
  assert.equal(again.title, 'The Lighthouse')
  assert.deepEqual(again.scenes, scenes)
})
