/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CMS_PHP_URL?: string
  readonly VITE_CMS_NODE_URL?: string
  readonly VITE_CMS_DEFAULT?: 'php' | 'node'
  readonly VITE_CMS_PHP_TOKEN?: string
  readonly VITE_CMS_NODE_TOKEN?: string
}
