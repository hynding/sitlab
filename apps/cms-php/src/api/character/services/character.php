<?php

declare(strict_types=1);

/**
 * character service: the core service, restricted to the signed-in user's own documents
 */

require_once __DIR__ . '/../../../utils/ownership.php';

return \Sitlab\Utils\Ownership::service('api::character.character');
