/**
 * Story ownership. Every content type with an `owner` relation to users-permissions' user
 * (Story, Character, Character arc, Plot line, Scene, Source) belongs to the user who created it.
 * A signed-in user (a users-permissions JWT) only sees and changes their own documents:
 *
 *   find      lists only theirs
 *   findOne   someone else's document is a 404, as if it did not exist
 *   update    the same 404; `owner` cannot be changed
 *   delete    the same as a missing document (Strapi answers 204 and deletes nothing)
 *   create    `owner` is set to them
 *
 * and may only link documents they own: a relation to someone else's document is a 400
 * ValidationError, so nobody can attach a scene to another person's story.
 *
 * API tokens (the admin's, scripts, the conformance runner) are not restricted; neither is the
 * admin panel, which does not go through these services.
 *
 * The core service is wrapped rather than the controller, so the core controllers keep doing the
 * validation, sanitizing and response shapes. It reads the request from strapi.requestContext.
 *
 * apps/cms-php/src/utils/ownership.php is the same code for strapi-php.
 */
import { factories } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const USER = 'plugin::users-permissions.user';

type Params = Record<string, any> & { data?: Record<string, any>; filters?: Record<string, any> };
type Ref = string | number;

/** The signed-in user the current request acts for; null for API tokens, the public and no request. */
function requester(strapi: any): number | null {
  const auth = strapi.requestContext.get()?.state?.auth;
  if (auth?.strategy?.name !== 'users-permissions') return null;
  const id = auth.credentials?.id;
  return typeof id === 'number' ? id : null;
}

/** Whether a content type has an owner, so its documents belong to a user. */
export function isOwned(strapi: any, uid: string): boolean {
  const owner = strapi.contentType(uid)?.attributes?.owner;
  return owner?.type === 'relation' && owner.target === USER;
}

/** The documents a relation value links: plain values, `connect` and `set`, not `disconnect`. */
function references(value: unknown): Ref[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(references);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('connect' in v || 'set' in v || 'disconnect' in v) return [...references(v.connect), ...references(v.set)];
    if (typeof v.documentId === 'string') return [v.documentId];
    if (typeof v.id === 'number' || typeof v.id === 'string') return [v.id];
  }
  return [];
}

/** Throws unless every owned document `data` links to belongs to `userId`. */
async function assertOwnsLinks(strapi: any, uid: string, data: unknown, userId: number): Promise<void> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const attributes: Record<string, any> = strapi.contentType(uid).attributes;
  for (const [name, attribute] of Object.entries(attributes)) {
    if (attribute.type !== 'relation' || name === 'owner' || !(name in data) || !isOwned(strapi, attribute.target)) continue;
    const refs = [...new Set(references((data as Record<string, unknown>)[name]))];
    if (refs.length === 0) continue;
    const documentIds = refs.filter((r) => typeof r === 'string');
    const ids = refs.filter((r) => typeof r === 'number');
    const or: Record<string, unknown>[] = [];
    if (documentIds.length) or.push({ documentId: { $in: documentIds } });
    if (ids.length) or.push({ id: { $in: ids } });
    const owned: { id: number; documentId: string }[] = await strapi.db.query(attribute.target).findMany({
      select: ['id', 'documentId'],
      where: { $or: or, owner: { id: userId } },
    });
    for (const ref of refs) {
      if (!owned.some((row) => row.documentId === ref || row.id === ref)) {
        throw new errors.ValidationError(`Document with id "${ref}" not found`);
      }
    }
  }
}

async function owns(strapi: any, uid: string, documentId: string, userId: number): Promise<boolean> {
  return (await strapi.db.query(uid).count({ where: { documentId, owner: { id: userId } } })) > 0;
}

function withoutOwner(params: Params): Params {
  if (!params.data || typeof params.data !== 'object') return params;
  const { owner: _owner, ...data } = params.data;
  return { ...params, data };
}

/** `factories.createCoreService(uid)` with the ownership rules above. */
export function ownedService(uid: string) {
  return factories.createCoreService(uid as any, ({ strapi }) => ({
    async find(params: Params = {}) {
      const userId = requester(strapi);
      if (userId === null) return super.find(params);
      const mine = { owner: { id: userId } };
      return super.find({ ...params, filters: params.filters ? { $and: [params.filters, mine] } : mine });
    },

    async findOne(documentId: string, params: Params = {}) {
      const userId = requester(strapi);
      if (userId !== null && !(await owns(strapi, uid, documentId, userId))) return null;
      return super.findOne(documentId, params);
    },

    async create(params: Params = { data: {} }) {
      const userId = requester(strapi);
      if (userId === null) return super.create(params);
      await assertOwnsLinks(strapi, uid, params.data, userId);
      return super.create({ ...params, data: { ...params.data, owner: userId } });
    },

    async update(documentId: string, params: Params = { data: {} }) {
      const userId = requester(strapi);
      if (userId === null) return super.update(documentId, params);
      if (!(await owns(strapi, uid, documentId, userId))) return null;
      await assertOwnsLinks(strapi, uid, params.data, userId);
      return super.update(documentId, withoutOwner(params));
    },

    async delete(documentId: string, params: Params = {}) {
      const userId = requester(strapi);
      if (userId !== null && !(await owns(strapi, uid, documentId, userId))) return { deletedEntries: 0 };
      return super.delete(documentId, params);
    },
  }) as any);
}
