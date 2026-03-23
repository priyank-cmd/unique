/**
 * Project generator service.
 * Exposes generateProject and generateAndPushToGitHub for use by API.
 */
import { buildGeneratedProjectBundle, generateProject } from './generateProject.js'
import { createGitHubRepo, pushProjectFilesToGitHub } from './github.js'
import { assertBundleSafeForGitHubPush } from './pushSecretScan.js'

export { generateProject, buildGeneratedProjectBundle } from './generateProject.js'
export { createGitHubRepo, pushProjectFilesToGitHub } from './github.js'

function sanitizeRepoName(repoName) {
  const safeName = String(repoName || 'generated-project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return safeName || 'generated-project'
}

/**
 * Generate project in memory and push it directly to a new GitHub repo.
 * @param {string[]} features - e.g. ['chat', 'srs']
 * @param {string} repoName - GitHub repo name
 * @param {string} githubToken - GitHub personal access token (from env)
 * @param {object} options - { private?: boolean }
 * @returns {Promise<{ repoUrl: string, features: string[], outputDir: null, source: string, repoName: string }>}
 */
export async function generateAndPushToGitHub(features, repoName, githubToken, options = {}) {
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN environment variable is required for GitHub push.')
  }

  const safeRepoName = sanitizeRepoName(repoName)
  const { cloneUrl, htmlUrl, repoName: finalRepoName, defaultBranch } = await createGitHubRepo(githubToken, safeRepoName, {
    private: options.private ?? false,
  })
  const companyFeatureTagsForMetadata = Array.isArray(options.companyFeatureTagsForMetadata)
    ? options.companyFeatureTagsForMetadata
    : []

  const companyWebsiteUrl = typeof options.companyWebsiteUrl === 'string' ? options.companyWebsiteUrl.trim() : ''
  const companyName = typeof options.companyName === 'string' ? options.companyName.trim() : ''
  const companyOtherUrls = Array.isArray(options.companyOtherUrls)
    ? options.companyOtherUrls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
    : []
  const companyLogoAbsPath = typeof options.companyLogoAbsPath === 'string' && options.companyLogoAbsPath.trim()
    ? options.companyLogoAbsPath.trim()
    : undefined
  const bundle = await buildGeneratedProjectBundle(features, {
    projectName: finalRepoName,
    mode: options.mode || 'full',
    companyFeatureTagsForMetadata,
    companyWebsiteUrl: companyWebsiteUrl || undefined,
    companyName: companyName || undefined,
    companyOtherUrls: companyOtherUrls.length ? companyOtherUrls : undefined,
    companyLogoAbsPath,
  })
  assertBundleSafeForGitHubPush(bundle.files)
  await pushProjectFilesToGitHub(githubToken, cloneUrl, bundle.files, {
    commitMessage: `Initial commit: ${finalRepoName}`,
    branch: defaultBranch || 'main',
  })
  return { repoUrl: htmlUrl, features: bundle.features, outputDir: null, source: bundle.source, repoName: finalRepoName }
}
