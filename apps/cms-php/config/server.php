<?php

declare(strict_types=1);

use Strapi\Utils\EnvHelper;

return static fn (EnvHelper $env): array => [
    'host' => $env('HOST', '0.0.0.0'),
    'port' => $env->int('PORT', 1337),
    // the public address when deployed (https://api.sitlab.dev); admin links and upload URLs use it
    'url' => $env('PUBLIC_URL', ''),
    'app' => [
        'keys' => $env->array('APP_KEYS'),
    ],
    'webhooks' => [
        'populateRelations' => $env->bool('WEBHOOKS_POPULATE_RELATIONS', false),
    ],
];
