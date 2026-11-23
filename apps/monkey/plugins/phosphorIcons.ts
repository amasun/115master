import type { IconifyJSON } from '@iconify/vue'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VIRTUAL_ID = 'virtual:phosphor-icons'
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`
const MONKEY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY_PATH = resolve(MONKEY_ROOT, 'src/icons/registry.ts')
const require = createRequire(import.meta.url)

function loadPhosphorJSON(): IconifyJSON {
  return require('@iconify-json/ph/icons.json') as IconifyJSON
}

function collectRegistryIconNames(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const names = new Set<string>()
  const pattern = /'ph:([a-z0-9-]+)'/g
  for (const match of withoutComments.matchAll(pattern)) {
    const name = match[1]
    if (name)
      names.add(name)
  }
  return Array.from(names)
}

function resolveIconBody(collection: IconifyJSON, name: string) {
  let cursor = name
  const visited = new Set<string>()
  while (!collection.icons[cursor]) {
    const alias = collection.aliases?.[cursor]
    if (!alias || visited.has(cursor))
      return null
    visited.add(cursor)
    cursor = alias.parent
  }
  const base = collection.icons[cursor]
  if (!base)
    return null
  return base
}

/** 根据 registry.ts 中声明的 ph:* 图标及其伴生 -fill 变体抽取离线 Phosphor 子集 */
export function buildPhosphorSubset(): IconifyJSON {
  const registrySource = readFileSync(REGISTRY_PATH, 'utf8')
  const requested = collectRegistryIconNames(registrySource)
  const source = loadPhosphorJSON()
  const needed = new Set<string>()

  requested.forEach((name) => {
    needed.add(name)
    if (name.endsWith('-bold'))
      needed.add(name.replace(/-bold$/, '-fill'))
  })

  const missing: string[] = []
  const icons: IconifyJSON['icons'] = {}

  Array.from(needed).sort().forEach((name) => {
    const icon = resolveIconBody(source, name)
    if (!icon) {
      missing.push(`ph:${name}`)
      return
    }
    icons[name] = icon
  })

  if (missing.length > 0) {
    throw new Error(`[phosphorIconsPlugin] 以下图标不存在于 @iconify-json/ph：${missing.join(', ')}`)
  }

  return {
    prefix: source.prefix || 'ph',
    width: source.width ?? 256,
    height: source.height ?? 256,
    icons,
  }
}

/** Vite 插件：在构建与开发期自动生成离线 Phosphor 图标子集模块 `virtual:phosphor-icons` */
export function phosphorIconsPlugin(): Plugin {
  return {
    name: 'monkey-phosphor-icons',
    resolveId(id) {
      if (id === VIRTUAL_ID)
        return RESOLVED_VIRTUAL_ID
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID)
        return
      this.addWatchFile(REGISTRY_PATH)
      const subset = buildPhosphorSubset()
      return `export const phCollection = ${JSON.stringify(subset)}\n`
    },
    handleHotUpdate(ctx) {
      if (resolve(ctx.file) !== REGISTRY_PATH)
        return
      const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
      if (!mod)
        return
      ctx.server.moduleGraph.invalidateModule(mod)
      return [mod]
    },
  }
}
