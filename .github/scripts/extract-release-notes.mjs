import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'

const version = argv[2]
if (!version) {
  console.error('Usage: node extract-release-notes.mjs <version>')
  exit(1)
}

function readChangelogNotes() {
  let content
  try {
    content = readFileSync('apps/monkey/CHANGELOG.md', 'utf-8')
  }
  catch {
    return ''
  }

  const lines = content.split('\n')
  let found = false
  const notes = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (found)
        break
      if (line.replace('## ', '').trim() === version)
        found = true
      continue
    }
    if (found)
      notes.push(line)
  }

  return notes.join('\n').trim()
}

function readCommitNotes() {
  try {
    const currentTag = `v${version}`
    const prevTag = execFileSync(
      'git',
      ['describe', '--tags', '--abbrev=0', `${currentTag}^`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    const range = prevTag ? `${prevTag}..${currentTag}` : currentTag
    const log = execFileSync(
      'git',
      ['log', range, '--no-merges', '--pretty=format:- %s (%h)'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    const commits = log
      .split('\n')
      .filter(line => line && !line.startsWith('- release:'))
    if (commits.length === 0)
      return ''
    return `### Changes\n\n${commits.join('\n')}`
  }
  catch {
    return ''
  }
}

const changelog = readChangelogNotes()
if (changelog) {
  console.log(changelog)
  exit(0)
}

const commits = readCommitNotes()
console.log(commits || `Release v${version}`)
