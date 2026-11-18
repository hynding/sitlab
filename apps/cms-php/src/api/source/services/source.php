<?php

declare(strict_types=1);

/**
 * source service: the core service, restricted to the signed-in user's own documents
 */

require_once __DIR__ . '/../../../utils/ownership.php';

return \Sitlab\Utils\Ownership::service('api::source.source');
