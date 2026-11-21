import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const args = process.argv.slice(2)
const allowDirty = args.includes('--allow-dirty')
const noRebase = args.includes('--no-rebase')
const release = args.includes('--release')
const pushArgs = args.filter(arg => arg !== '--allow-dirty' && arg !== '--no-rebase' && arg !== '--release')
const isForcePush = pushArgs.some(arg => arg === '-f' || arg === '--force' || arg.startsWith('--force-with-lease'))

function run(command, argv) {
  return spawnSync(command, argv, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

function fail(message, result) {
  console.error(`❌ ${message}`)
  if (result?.stdout?.trim())
    console.error(result.stdout.trim())
  if (result?.stderr?.trim())
    console.error(result.stderr.trim())
  process.exit(result?.status || 1)
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function main() {
  const branchResult = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branchResult.status !== 0)
    fail('无法获取当前 Git 分支', branchResult)

  const branch = branchResult.stdout.trim()
  if (!branch || branch === 'HEAD')
    fail('当前处于 detached HEAD 状态，请先切换到目标分支')

  if (!allowDirty) {
    const status = run('git', ['status', '--porcelain'])
    if (status.status !== 0)
      fail('无法检查 Git 工作区状态', status)
    if (status.stdout.trim())
      fail('工作区存在未提交改动，请先提交（或传入 --allow-dirty）', status)
  }

  const upstream = run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstream.status === 0 && !noRebase && !isForcePush) {
    const pull = run('git', ['pull', '--rebase', '--autostash'])
    if (pull.status !== 0)
      fail('同步远端提交（git pull --rebase）失败，请解决冲突后重试（或传入 --no-rebase）', pull)
  }

  const head = run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim()

  const build = run('pnpm', ['build'])
  if (build.status !== 0)
    fail('userscript 构建失败，已中止推送', build)

  const artifacts = [
    'apps/monkey/dist/115master-fusion.user.js',
    'apps/monkey/dist/115master-fusion.meta.js',
  ].map((file) => {
    try {
      const stat = statSync(resolve(root, file))
      if (stat.size <= 0)
        fail(`构建产物为空：${file}`)
      return { file, size: stat.size }
    }
    catch {
      return fail(`缺少构建产物：${file}`)
    }
  })

  const gitPushArgs = upstream.status === 0
    ? ['push', ...pushArgs]
    : ['push', '-u', 'origin', branch, ...pushArgs]
  const push = run('git', gitPushArgs)
  if (push.status !== 0)
    fail(`推送分支 ${branch} 失败`, push)

  const pkg = JSON.parse(readFileSync(resolve(root, 'apps/monkey/package.json'), 'utf8'))
  const summary = [
    `✅ 推送与 userscript 构建完成`,
    `   branch : ${branch} (${head})`,
    `   version: v${pkg.version}`,
    ...artifacts.map(item => `   output : ${item.file} (${formatSize(item.size)})`),
  ]

  if (release) {
    const wf = run('gh', ['workflow', 'run', 'release.yml', '--ref', branch])
    if (wf.status !== 0)
      fail('触发 Release 工作流失败', wf)
    summary.push(`   release: 已触发 release.yml (${branch}，若当前版本 tag 已存在将自动递增 patch)`)
  }

  console.log(summary.join('\n'))
}

main()
