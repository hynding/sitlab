import { test } from 'node:test'
import assert from 'node:assert/strict'
import { element, matchCharacter, parse, sceneLines, serialize, speakerName, speakers, type Element } from '../src/screenplay/elements.ts'

const shape = (els: Element[]) => els.map(({ type, text }) => [type, text])

test('reads a Fountain scene body into elements', () => {
  const text = [
    'Waves hammer the rocks. ADA climbs the stairs.',
    '',
    'ADA (V.O.)',
    '(whispering)',
    'Nobody comes up here.',
    'Not anymore.',
    '',
    '@McCoy',
    'Then who lit the lamp?',
    '',
    'CUT TO:',
  ].join('\n')
  assert.deepEqual(shape(parse(text)), [
    ['action', 'Waves hammer the rocks. ADA climbs the stairs.'],
    ['character', 'ADA (V.O.)'],
    ['parenthetical', 'whispering'],
    ['dialogue', 'Nobody comes up here.\nNot anymore.'],
    ['character', 'McCoy'],
    ['dialogue', 'Then who lit the lamp?'],
    ['transition', 'CUT TO:'],
  ])
})

test('round-trips what it writes', () => {
  const els = [
    element('action', 'A gull lands.'),
    element('character', 'ADA'),
    element('parenthetical', '(beat)'),
    element('dialogue', 'Hello?'),
    element('transition', 'FADE OUT.'),
    element('action', 'BOOM\nThe door gives.'),
    element('action', 'SMASH TO:'),
    element('character', 'McCOY'),
    element('dialogue', 'Line one.\n\nLine two.'),
  ]
  const text = serialize(els)
  assert.match(text, /^> FADE OUT\.$/m)
  assert.match(text, /^!BOOM$/m)
  assert.match(text, /^!SMASH TO:$/m)
  assert.match(text, /^@McCOY$/m)
  assert.deepEqual(shape(parse(text)), [
    ['action', 'A gull lands.'],
    ['character', 'ADA'],
    ['parenthetical', 'beat'],
    ['dialogue', 'Hello?'],
    ['transition', 'FADE OUT.'],
    ['action', 'BOOM\nThe door gives.'],
    ['action', 'SMASH TO:'],
    ['character', 'McCOY'],
    ['dialogue', 'Line one.\nLine two.'],
  ])
  assert.equal(serialize(parse(text)), text)
})

test('keeps Fountain it has no element for', () => {
  const text = '[[a note]]\n\n= a synopsis\n\n>THE END<\n\n.FLASHBACK'
  assert.equal(serialize(parse(text)), text)
})

test('drops empty elements and writes stray dialogue as action', () => {
  assert.equal(serialize([element('action', '  '), element('dialogue', 'Hi')]), '!Hi')
})

test('speakers and matching story characters', () => {
  assert.equal(speakerName("ada (CONT'D) ^"), 'ADA')
  const els = parse('ADA\nHi.\n\nBEN (O.S.)\nHey.\n\nADA\nBye.')
  assert.deepEqual(speakers(els), ['ADA', 'BEN'])
  const cast = [{ name: 'Ada Lovelace' }, { name: 'Ben Ross' }, { name: 'Ben Kim' }]
  assert.equal(matchCharacter('ADA', cast)?.name, 'Ada Lovelace')
  assert.equal(matchCharacter('ADA LOVELACE', cast)?.name, 'Ada Lovelace')
  assert.equal(matchCharacter('BEN', cast), undefined)
})

test('estimates printed lines', () => {
  assert.equal(sceneLines([]), 3)
  assert.equal(sceneLines(parse('A.\n\nADA\nHi.')), 2 + 1 + 1 + 1 + 1 + 1)
})
