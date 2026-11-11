// 打点功能验收脚本：由 Claude 维护，执行者不得修改。
// 用法：node docs/agy/verify.mjs
// 不跑全量测试，只跑与打点相关的单测 + 类型检查 + lint + 构建。
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const results = []

function run(name, cmd) {
  const started = Date.now()
  const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const ok = r.status === 0
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ name, ok, seconds })
  if (!ok) {
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n')
    console.log(`\n--- ${name} FAILED (last 40 lines) ---\n${out.slice(-40).join('\n')}`)
  }
  return ok
}

/** 收集目录下的 *.test.ts */
function tests(dir) {
  const abs = join(root, dir)
  if (!existsSync(abs))
    return []
  return readdirSync(abs).flatMap((name) => {
    const rel = `${dir}/${name}`
    if (statSync(join(root, rel)).isDirectory())
      return tests(rel)
    return /\.test\.tsx?$/.test(name) ? [rel] : []
  })
}

run('build drive115', 'pnpm --filter @115master/drive115 build')
run('type-check', 'pnpm type-check')
run('lint', 'pnpm lint')

const monkeyTests = [
  ...tests('apps/monkey/src/utils/markers'),
  ...tests('apps/monkey/src/utils/cache/__tests__').filter(f => /marker/i.test(f)),
  ...tests('apps/monkey/src/pages/video/data/__tests__').filter(f => /marker/i.test(f)),
  ...tests('apps/monkey/src/components/XPlayer').filter(f => /marker/i.test(f)),
].map(f => f.replace('apps/monkey/', ''))

if (monkeyTests.length === 0) {
  results.push({ name: 'marker unit tests (monkey)', ok: false, seconds: 0 })
  console.log('\n--- no marker test files found under apps/monkey ---')
}
else {
  run(`marker unit tests (monkey, ${monkeyTests.length} files)`, `pnpm --filter @115master/monkey exec vitest run --project unit ${monkeyTests.join(' ')}`)
}

const driveTests = tests('packages/drive115/src/__tests__').filter(f => /desc/i.test(f))
if (driveTests.length > 0)
  run(`desc unit tests (drive115, ${driveTests.length} files)`, `pnpm --filter @115master/drive115 exec vitest run ${driveTests.map(f => f.replace('packages/drive115/', '')).join(' ')}`)

run('build userscript', 'pnpm --filter @115master/monkey build')

console.log('\n=== verify summary ===')
for (const r of results)
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.seconds}s)`)
process.exit(results.every(r => r.ok) ? 0 : 1)
