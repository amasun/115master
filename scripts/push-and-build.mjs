import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const rawArgs = process.argv.slice(2)

function parseArgs(argv) {
  let allowDirty = false
  let noRebase = false
  let release = false
  let autoCommit = false
  let commitMessage = ''
  let onlyBranch = ''
  const pushArgs = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--allow-dirty') {
      allowDirty = true
    }
    else if (arg === '--no-rebase') {
      noRebase = true
    }
    else if (arg === '--release') {
      release = true
    }
    else if (arg === '--commit' || arg === '-c') {
      autoCommit = true
    }
    else if (arg === '-m' || arg === '--message') {
      autoCommit = true
      commitMessage = argv[i + 1] ?? ''
      i += 1
    }
    else if (arg.startsWith('--message=')) {
      autoCommit = true
      commitMessage = arg.slice('--message='.length)
    }
    else if (arg === '--only-branch') {
      onlyBranch = argv[i + 1] ?? ''
      i += 1
    }
    else if (arg.startsWith('--only-branch=')) {
      onlyBranch = arg.slice('--only-branch='.length)
    }
    else {
      pushArgs.push(arg)
    }
  }

  const isForcePush = pushArgs.some(arg => arg === '-f' || arg === '--force' || arg.startsWith('--force-with-lease'))
  return { allowDirty, noRebase, release, autoCommit, commitMessage, onlyBranch, pushArgs, isForcePush }
}

function defaultCommitMessage() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  return `chore: update (${stamp})`
}

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
  const opts = parseArgs(rawArgs)

  const branchResult = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branchResult.status !== 0)
    fail('无法获取当前 Git 分支', branchResult)

  const branch = branchResult.stdout.trim()
  if (!branch || branch === 'HEAD')
    fail('当前处于 detached HEAD 状态，请先切换到目标分支')

  if (opts.onlyBranch && branch !== opts.onlyBranch)
    fail(`当前分支为 ${branch}，仅允许在 ${opts.onlyBranch} 分支执行此操作`)

  const status = run('git', ['status', '--porcelain'])
  if (status.status !== 0)
    fail('无法检查 Git 工作区状态', status)

  const hasChanges = Boolean(status.stdout.trim())
  let committedMessage = ''

  if (hasChanges) {
    if (opts.autoCommit) {
      const addResult = run('git', ['add', '-A'])
      if (addResult.status !== 0)
        fail('暂存工作区改动（git add -A）失败', addResult)

      committedMessage = opts.commitMessage.trim() || defaultCommitMessage()
      const commitResult = run('git', ['commit', '-m', committedMessage])
      if (commitResult.status !== 0)
        fail('提交改动（git commit）失败', commitResult)
    }
    else if (!opts.allowDirty) {
      fail('工作区存在未提交改动，请先提交（或传入 --commit / --allow-dirty）', status)
    }
  }

  const upstream = run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstream.status === 0 && !opts.noRebase && !opts.isForcePush) {
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
    ? ['push', ...opts.pushArgs]
    : ['push', '-u', 'origin', branch, ...opts.pushArgs]
  const push = run('git', gitPushArgs)
  if (push.status !== 0)
    fail(`推送分支 ${branch} 失败`, push)

  const pkg = JSON.parse(readFileSync(resolve(root, 'apps/monkey/package.json'), 'utf8'))
  const summary = [
    `✅ 推送与 userscript 构建完成`,
    `   branch : ${branch} (${head})`,
    ...(committedMessage ? [`   commit : ${committedMessage}`] : []),
    `   version: v${pkg.version}`,
    ...artifacts.map(item => `   output : ${item.file} (${formatSize(item.size)})`),
  ]

  if (opts.release) {
    const wf = run('gh', ['workflow', 'run', 'release.yml', '--ref', branch])
    if (wf.status !== 0)
      fail('触发 Release 工作流失败', wf)
    summary.push(`   release: 已触发 release.yml (${branch}，若当前版本 tag 已存在将自动递增 patch)`)
  }

  console.log(summary.join('\n'))
}

main()
