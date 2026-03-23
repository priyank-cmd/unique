/**
 * GitHub integration: create repo and push generated files directly via GitHub APIs.
 * No local git repository or generated project folder is required for the publish step.
 */
import axios from 'axios'

const GITHUB_API = 'https://api.github.com'

function sanitizeGitHubRepoName(repoName) {
  return String(repoName)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createGitHubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function extractGitHubErrorMessage(err) {
  const data = err?.response?.data
  const apiMessage = data?.message
  const details = Array.isArray(data?.errors)
    ? data.errors
      .map((item) => item?.message || [item?.resource, item?.field, item?.code].filter(Boolean).join(' '))
      .filter(Boolean)
      .join('; ')
    : ''
  const base = [apiMessage, details].filter(Boolean).join(': ')
  if (base) return base
  try {
    if (data && typeof data === 'object') {
      const compact = JSON.stringify(data)
      if (compact && compact !== '{}') return compact
    }
  } catch {
    /* ignore */
  }
  return err?.message || 'GitHub repository creation failed.'
}

function isRepoNameConflict(err) {
  const message = extractGitHubErrorMessage(err)
  return err?.response?.status === 422 && /already exists|name already exists/i.test(message)
}

/**
 * Create a new GitHub repository (authenticated).
 * @param {string} token - GitHub personal access token
 * @param {string} repoName - Repository name (e.g. "chat-only-project")
 * @param {object} options - { description?: string, private?: boolean }
 * @returns {Promise<{ cloneUrl: string, htmlUrl: string }>}
 */
export async function createGitHubRepo(token, repoName, options = {}) {
  if (!token || !repoName) {
    throw new Error('GitHub token and repo name are required.')
  }
  const sanitizedName = sanitizeGitHubRepoName(repoName)

  if (!sanitizedName) {
    throw new Error('Repository name is invalid.')
  }

  const nameSeed = Date.now().toString(36)
  const candidates = [
    sanitizedName,
    `${sanitizedName}-${nameSeed}`,
    `${sanitizedName}-${nameSeed}-2`,
  ]

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    try {
      const { data } = await axios.post(
        `${GITHUB_API}/user/repos`,
        {
          name: candidate,
          description: options.description || `Generated project: ${candidate}`,
          private: options.private ?? false,
          auto_init: true,
        },
        {
        headers: createGitHubHeaders(token),
        },
      )
      const cloneUrl = data.clone_url
      const htmlUrl = data.html_url
      return {
        cloneUrl,
        htmlUrl,
        repoName: data.name || candidate,
        owner: data.owner?.login || null,
        defaultBranch: data.default_branch || 'main',
      }
    } catch (err) {
      if (index < candidates.length - 1 && isRepoNameConflict(err)) {
        continue
      }
      throw new Error(extractGitHubErrorMessage(err))
    }
  }

  throw new Error('GitHub repository creation failed.')
}

/**
 * Push all generated project files directly to GitHub using the contents API.
 * This avoids local folders and local git repositories entirely.
 * @param {string} token
 * @param {string} cloneUrlOrHtmlUrl - e.g. https://github.com/username/repo.git
 * @param {Record<string, string>} files - path -> file content
 * @param {object} options - { commitMessage?: string, branch?: string }
 */
export async function pushProjectFilesToGitHub(token, cloneUrlOrHtmlUrl, files, options = {}) {
  if (!token) {
    throw new Error('GitHub token is required.')
  }
  if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
    throw new Error('No files to publish to GitHub.')
  }

  const url = new URL(cloneUrlOrHtmlUrl)
  const [owner, repoWithGit] = url.pathname.replace(/^\/+/, '').split('/')
  const repo = repoWithGit?.replace(/\.git$/, '')
  if (!owner || !repo) {
    throw new Error('Invalid GitHub repository URL.')
  }

  const branch = options.branch || 'main'
  const headers = createGitHubHeaders(token)
  const paths = Object.keys(files).sort()

  for (const path of paths) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    let existingSha

    try {
      const existingResponse = await axios.get(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`,
        {
          headers,
          params: { ref: branch },
        },
      )
      existingSha = existingResponse.data?.sha
    } catch (err) {
      if (err?.response?.status !== 404) {
        throw new Error(extractGitHubErrorMessage(err))
      }
    }

    const raw = files[path]
    const contentBase64 = Buffer.isBuffer(raw)
      ? raw.toString('base64')
      : Buffer.from(String(raw), 'utf8').toString('base64')

    try {
      await axios.put(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`,
        {
          message: options.commitMessage || `Add ${path}`,
          content: contentBase64,
          branch,
          ...(existingSha ? { sha: existingSha } : {}),
        },
        { headers },
      )
    } catch (err) {
      throw new Error(extractGitHubErrorMessage(err))
    }
  }
}
