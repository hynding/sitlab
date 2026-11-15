/**
 * Searches public reference sources (Wikipedia and Wikidata) from the browser. Both are MediaWiki
 * APIs that allow anonymous cross-origin reads with `origin=*`, so no CMS code is involved: a
 * finding only reaches the CMS when the user attaches it to a story as a Source.
 */
import type { Source } from './cms'

const lang = import.meta.env.VITE_RESEARCH_LANG ?? 'en'
const wikipediaApi = `https://${lang}.wikipedia.org/w/api.php`
const wikidataApi = 'https://www.wikidata.org/w/api.php'

export type Provider = 'wikipedia' | 'wikidata'

/** A search result, shaped like the Source it becomes when attached. */
export type Finding = Pick<
  Source,
  'title' | 'url' | 'topic' | 'kind' | 'wikidataId' | 'excerpt' | 'period' | 'imageUrl' | 'publisher' | 'license'
> & {
  /** Wikidata's or Wikipedia's one-line description, e.g. "English mathematician (1815–1852)". */
  description: string | null
}

async function get<T>(api: string, params: Record<string, string | number>): Promise<T> {
  const search = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*' })
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  const res = await fetch(`${api}?${search}`)
  if (!res.ok) throw new Error(`${new URL(api).hostname} answered ${res.status}`)
  const body = await res.json()
  if (body?.error) throw new Error(body.error.info ?? body.error.code ?? 'Search failed')
  return body as T
}

export async function search(provider: Provider, text: string, limit = 8): Promise<Finding[]> {
  return provider === 'wikipedia' ? searchWikipedia(text, limit) : searchWikidata(text, limit)
}

// --- Wikipedia ---------------------------------------------------------------------------------

type WikipediaPage = {
  pageid: number
  title: string
  index: number
  fullurl?: string
  description?: string
  extract?: string
  thumbnail?: { source: string }
  pageprops?: { wikibase_item?: string }
}

async function searchWikipedia(text: string, limit: number): Promise<Finding[]> {
  const body = await get<{ query?: { pages: WikipediaPage[] } }>(wikipediaApi, {
    action: 'query',
    generator: 'search',
    gsrsearch: text,
    gsrlimit: limit,
    prop: 'info|description|extracts|pageimages|pageprops',
    inprop: 'url',
    exintro: 1,
    explaintext: 1,
    exsentences: 3,
    exlimit: 'max',
    piprop: 'thumbnail',
    pithumbsize: 240,
    pilimit: 'max',
    ppprop: 'wikibase_item',
  })
  const pages = [...(body.query?.pages ?? [])].sort((a, b) => a.index - b.index)
  const entities = await getEntities(pages.flatMap((p) => p.pageprops?.wikibase_item ?? []))
  return pages.map((p) => {
    const id = p.pageprops?.wikibase_item ?? null
    const facts = id && entities[id] ? describeEntity(entities[id]) : null
    return {
      title: p.title,
      url: p.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      description: p.description ?? null,
      excerpt: p.extract?.trim() || null,
      imageUrl: p.thumbnail?.source ?? facts?.imageUrl ?? null,
      wikidataId: id,
      topic: facts?.topic ?? null,
      period: facts?.period ?? null,
      kind: 'article',
      publisher: 'Wikipedia',
      license: 'CC BY-SA 4.0',
    }
  })
}

// --- Wikidata ----------------------------------------------------------------------------------

type Snak = { snaktype: string; datavalue?: { value: unknown } }
type Claim = { mainsnak: Snak; rank: string }
type Entity = {
  id: string
  missing?: string
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  claims?: Record<string, Claim[]>
  sitelinks?: Record<string, { title: string; url?: string }>
}

async function searchWikidata(text: string, limit: number): Promise<Finding[]> {
  const body = await get<{ search: { id: string }[] }>(wikidataApi, {
    action: 'wbsearchentities',
    search: text,
    language: lang,
    uselang: lang,
    type: 'item',
    limit,
  })
  const ids = body.search.map((s) => s.id)
  const entities = await getEntities(ids)
  return ids.flatMap((id) => {
    const entity = entities[id]
    if (!entity) return []
    const facts = describeEntity(entity)
    const title = entity.labels?.[lang]?.value ?? id
    const description = entity.descriptions?.[lang]?.value ?? null
    return [
      {
        title,
        url: `https://www.wikidata.org/wiki/${id}`,
        description,
        excerpt: description,
        imageUrl: facts.imageUrl,
        wikidataId: id,
        topic: facts.topic,
        period: facts.period,
        kind: 'dataset' as const,
        publisher: 'Wikidata',
        license: 'CC0 1.0',
      },
    ]
  })
}

/** Fetches entities by id, at most 50 per request (the API's limit for anonymous clients). */
async function getEntities(ids: string[]): Promise<Record<string, Entity>> {
  const out: Record<string, Entity> = {}
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    try {
      const body = await get<{ entities: Record<string, Entity> }>(wikidataApi, {
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'labels|descriptions|claims',
        languages: lang,
      })
      for (const [id, entity] of Object.entries(body.entities)) if (!entity.missing) out[id] = entity
    } catch {
      // the facts are a bonus; a Wikipedia result is still useful without them
    }
  }
  return out
}

// --- what an entity is, and when -----------------------------------------------------------------

/** Wikidata properties and classes the classification reads. */
const P = {
  instanceOf: 'P31',
  image: 'P18',
  coordinates: 'P625',
  born: 'P569',
  died: 'P570',
  inception: 'P571',
  dissolved: 'P576',
  start: 'P580',
  end: 'P582',
  pointInTime: 'P585',
  published: 'P577',
  author: 'P50',
} as const
const human = 'Q5'
const eraClasses = new Set(['Q11514315', 'Q6428674', 'Q186081', 'Q2577883', 'Q1291195']) // period, era, time interval, epoch, age
const eventClasses = new Set(['Q1190554', 'Q1656682', 'Q178561', 'Q198', 'Q645883', 'Q124734']) // occurrence, event, battle, war, military operation, revolution
const organizationClasses = new Set(['Q43229', 'Q4830453', 'Q7278', 'Q2659904', 'Q3918']) // organization, business, political party, government agency, university

function claims(entity: Entity, property: string): Snak[] {
  return (entity.claims?.[property] ?? []).filter((c) => c.rank !== 'deprecated').map((c) => c.mainsnak)
}

function itemIds(entity: Entity, property: string): string[] {
  return claims(entity, property).flatMap((s) => {
    const value = s.datavalue?.value as { id?: string } | undefined
    return value?.id ? [value.id] : []
  })
}

type WikidataTime = { time: string; precision: number }

/** '+1815-12-10T00:00:00Z' at day precision → '1815'; '-0044-…' → '44 BCE'; precision 7 → '19th century'. */
export function formatTime({ time, precision }: WikidataTime): string | null {
  const match = /^([+-])(\d+)-/.exec(time)
  if (!match) return null
  const bce = match[1] === '-'
  const year = Number(match[2])
  if (precision <= 7) {
    const century = Math.ceil(year / 100) || 1
    const suffix = century % 10 === 1 && century % 100 !== 11 ? 'st' : century % 10 === 2 && century % 100 !== 12 ? 'nd' : century % 10 === 3 && century % 100 !== 13 ? 'rd' : 'th'
    return `${century}${suffix} century${bce ? ' BCE' : ''}`
  }
  if (precision === 8) return `${Math.floor(year / 10) * 10}s${bce ? ' BCE' : ''}`
  return bce ? `${year} BCE` : String(year)
}

function time(entity: Entity, property: string): string | null {
  for (const s of claims(entity, property)) {
    const value = s.datavalue?.value as WikidataTime | undefined
    if (value?.time) return formatTime(value)
  }
  return null
}

function span(from: string | null, to: string | null): string | null {
  if (from && to) return from === to ? from : `${from} – ${to}`
  if (from) return `from ${from}`
  if (to) return `until ${to}`
  return null
}

export function describeEntity(entity: Entity): Pick<Finding, 'topic' | 'period' | 'imageUrl'> {
  const classes = itemIds(entity, P.instanceOf)
  const has = (property: string) => claims(entity, property).length > 0
  const isA = (set: Set<string>) => classes.some((c) => set.has(c))

  let topic: Finding['topic'] = 'other'
  if (classes.includes(human)) topic = 'person'
  else if (isA(eraClasses)) topic = 'era'
  else if (isA(eventClasses) || has(P.pointInTime)) topic = 'event'
  else if (has(P.coordinates)) topic = 'place'
  else if (isA(organizationClasses)) topic = 'organization'
  else if (has(P.author) || has(P.published)) topic = 'work'
  else if (has(P.start) || has(P.end)) topic = 'era'

  const period =
    topic === 'person'
      ? span(time(entity, P.born), time(entity, P.died))
      : (span(time(entity, P.start), time(entity, P.end)) ??
        time(entity, P.pointInTime) ??
        span(time(entity, P.inception), time(entity, P.dissolved)) ??
        time(entity, P.published))

  const image = claims(entity, P.image)[0]?.datavalue?.value
  const imageUrl =
    typeof image === 'string'
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image.replace(/ /g, '_'))}?width=240`
      : null

  return { topic, period, imageUrl }
}
