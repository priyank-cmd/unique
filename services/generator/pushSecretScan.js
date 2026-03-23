/**
 * Preflight checks before GitHub Contents API push.
 * GitHub push protection rejects blobs that match known secret shapes; we surface the path early.
 */
const PATTERNS = [
  { id: 'github_pat_classic', label: 'GitHub PAT (ghp_)', re: /ghp_[A-Za-z0-9]{36,}/ },
  { id: 'github_oauth', label: 'GitHub OAuth token (gho_/ghu_/ghs_)', re: /\bgh[ous]_[A-Za-z0-9]{36,}\b/ },
  { id: 'github_fine_grained', label: 'GitHub fine-grained PAT', re: /github_pat_[A-Za-z0-9_]{22,}/ },
  { id: 'anthropic_api', label: 'Anthropic API key', re: /sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/ },
  { id: 'openai_proj', label: 'OpenAI project key', re: /sk-proj-[A-Za-z0-9_-]{20,}/ },
  { id: 'stripe_live', label: 'Stripe secret key', re: /sk_live_[0-9a-zA-Z]{24,}/ },
  { id: 'slack_bot', label: 'Slack bot token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'aws_access', label: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'private_key_block', label: 'PEM / private key block', re: /-----BEGIN [A-Z0-9 -]*PRIVATE KEY-----/ },
]

/**
 * @param {Record<string, string|Buffer>} files
 * @returns {{ path: string, patternId: string, label: string }[]}
 */
export function findLikelySecretsInBundle(files) {
  const findings = []
  for (const [relPath, raw] of Object.entries(files)) {
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')
    if (buf.length === 0) continue
    // Skip obvious binary (GitHub still may scan; we avoid UTF-8 garbage)
    if (buf.includes(0)) continue

    let text
    try {
      text = buf.toString('utf8')
    } catch {
      continue
    }

    for (const { id, label, re } of PATTERNS) {
      if (re.test(text)) {
        findings.push({ path: relPath.replaceAll('\\', '/'), patternId: id, label })
        break
      }
    }
  }
  return findings
}

/**
 * @param {Record<string, string|Buffer>} files
 * @throws {Error}
 */
export function assertBundleSafeForGitHubPush(files) {
  const found = findLikelySecretsInBundle(files)
  if (found.length === 0) return

  const detail = found
    .map((f) => `- ${f.path}: possible ${f.label}`)
    .join('\n')

  throw new Error(
    `Refusing GitHub push: content looks like secrets (GitHub would block with "Secret detected in content").\n${detail}\n\n`
      + 'Remove or redact those values on the server (often .env.* copies, editor scratch files, or PDFs with example credentials), then retry.',
  )
}
