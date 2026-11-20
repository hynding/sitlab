<?php

declare(strict_types=1);

namespace Sitlab\Utils;

use Strapi\Core\Factories;
use Strapi\Core\Strapi;
use Strapi\Utils\Errors\ValidationError;

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
 * validation, sanitizing and response shapes. It reads the request from $strapi->requestContext().
 *
 * apps/cms-node/src/utils/ownership.ts is the same code for Strapi.
 */
final class Ownership
{
    private const USER = 'plugin::users-permissions.user';

    /** `Factories::createCoreService($uid)` with the ownership rules above. */
    public static function service(string $uid): \Closure
    {
        return Factories::createCoreService($uid, static fn (Strapi $strapi): array => [
            'find' => function (array $params = []) use ($strapi): array {
                $userId = Ownership::requester($strapi);
                if ($userId === null) {
                    return $this->base()->find($params);
                }
                $mine = ['owner' => ['id' => $userId]];
                $filters = $params['filters'] ?? null;

                return $this->base()->find([...$params, 'filters' => $filters ? ['$and' => [$filters, $mine]] : $mine]);
            },

            'findOne' => function (string $documentId, array $params = []) use ($strapi, $uid): ?array {
                $userId = Ownership::requester($strapi);
                if ($userId !== null && !Ownership::owns($strapi, $uid, $documentId, $userId)) {
                    return null;
                }

                return $this->base()->findOne($documentId, $params);
            },

            'create' => function (array $params = ['data' => []]) use ($strapi, $uid): array {
                $userId = Ownership::requester($strapi);
                if ($userId === null) {
                    return $this->base()->create($params);
                }
                Ownership::assertOwnsLinks($strapi, $uid, $params['data'] ?? null, $userId);
                $data = is_array($params['data'] ?? null) ? $params['data'] : [];

                return $this->base()->create([...$params, 'data' => [...$data, 'owner' => $userId]]);
            },

            'update' => function (string $documentId, array $params = ['data' => []]) use ($strapi, $uid): ?array {
                $userId = Ownership::requester($strapi);
                if ($userId === null) {
                    return $this->base()->update($documentId, $params);
                }
                if (!Ownership::owns($strapi, $uid, $documentId, $userId)) {
                    return null;
                }
                Ownership::assertOwnsLinks($strapi, $uid, $params['data'] ?? null, $userId);
                if (is_array($params['data'] ?? null)) {
                    unset($params['data']['owner']);
                }

                return $this->base()->update($documentId, $params);
            },

            'delete' => function (string $documentId, array $params = []) use ($strapi, $uid): array {
                $userId = Ownership::requester($strapi);
                if ($userId !== null && !Ownership::owns($strapi, $uid, $documentId, $userId)) {
                    return ['deletedEntries' => 0];
                }

                return $this->base()->delete($documentId, $params);
            },
        ]);
    }

    /** The signed-in user the current request acts for; null for API tokens, the public and no request. */
    public static function requester(Strapi $strapi): ?int
    {
        $auth = $strapi->requestContext()->get()?->state()->auth();
        if (($auth['strategy']['name'] ?? null) !== 'users-permissions') {
            return null;
        }
        $id = $auth['credentials']['id'] ?? null;

        return is_int($id) ? $id : null;
    }

    /** Whether a content type has an owner, so its documents belong to a user. */
    public static function isOwned(Strapi $strapi, string $uid): bool
    {
        $owner = $strapi->contentType($uid)->attributes['owner'] ?? null;

        return is_array($owner) && ($owner['type'] ?? null) === 'relation' && ($owner['target'] ?? null) === self::USER;
    }

    public static function owns(Strapi $strapi, string $uid, string $documentId, int $userId): bool
    {
        return $strapi->db()->query($uid)->count(['where' => ['documentId' => $documentId, 'owner' => ['id' => $userId]]]) > 0;
    }

    /**
     * The documents a relation value links: plain values, `connect` and `set`, not `disconnect`.
     *
     * @return list<string|int>
     */
    public static function references(mixed $value): array
    {
        if (is_string($value) || is_int($value)) {
            return [$value];
        }
        if (!is_array($value)) {
            return [];
        }
        if (array_is_list($value)) {
            $refs = [];
            foreach ($value as $item) {
                $refs = [...$refs, ...self::references($item)];
            }

            return $refs;
        }
        if (array_key_exists('connect', $value) || array_key_exists('set', $value) || array_key_exists('disconnect', $value)) {
            return [...self::references($value['connect'] ?? null), ...self::references($value['set'] ?? null)];
        }
        if (is_string($value['documentId'] ?? null)) {
            return [$value['documentId']];
        }
        if (is_int($value['id'] ?? null) || is_string($value['id'] ?? null)) {
            return [$value['id']];
        }

        return [];
    }

    /** Throws unless every owned document `$data` links to belongs to `$userId`. */
    public static function assertOwnsLinks(Strapi $strapi, string $uid, mixed $data, int $userId): void
    {
        if (!is_array($data) || array_is_list($data) && $data !== []) {
            return;
        }
        foreach ($strapi->contentType($uid)->attributes as $name => $attribute) {
            $target = $attribute['target'] ?? null;
            if (($attribute['type'] ?? null) !== 'relation' || $name === 'owner' || !array_key_exists($name, $data)
                || !is_string($target) || !self::isOwned($strapi, $target)) {
                continue;
            }
            $refs = array_values(array_unique(self::references($data[$name]), SORT_REGULAR));
            if ($refs === []) {
                continue;
            }
            $documentIds = array_values(array_filter($refs, 'is_string'));
            $ids = array_values(array_filter($refs, 'is_int'));
            $or = [];
            if ($documentIds !== []) {
                $or[] = ['documentId' => ['$in' => $documentIds]];
            }
            if ($ids !== []) {
                $or[] = ['id' => ['$in' => $ids]];
            }
            $owned = $strapi->db()->query($target)->findMany([
                'select' => ['id', 'documentId'],
                'where' => ['$or' => $or, 'owner' => ['id' => $userId]],
            ]);
            foreach ($refs as $ref) {
                $found = false;
                foreach ($owned as $row) {
                    if (($row['documentId'] ?? null) === $ref || ($row['id'] ?? null) === $ref) {
                        $found = true;
                        break;
                    }
                }
                if (!$found) {
                    throw new ValidationError("Document with id \"{$ref}\" not found");
                }
            }
        }
    }
}
