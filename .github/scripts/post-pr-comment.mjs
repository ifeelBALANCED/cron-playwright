#!/usr/bin/env node
/**
 * post-pr-comment.mjs
 * 
 * Posts or updates a PR comment with links to Playwright reports.
 * Uses GitHub API to find existing comment and update it, or create new one.
 * 
 * Usage:
 *   GITHUB_TOKEN=xxx node post-pr-comment.mjs \
 *     --owner "owner" \
 *     --repo "repo" \
 *     --pr "123" \
 *     --runId "456789" \
 *     --sha "abc123" \
 *     --pagesUrl "https://owner.github.io/repo" \
 *     --jobs "chromium,webkit,firefox"
 */

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    owner: { type: 'string' },
    repo: { type: 'string' },
    pr: { type: 'string' },
    runId: { type: 'string' },
    sha: { type: 'string' },
    pagesUrl: { type: 'string' },
    jobs: { type: 'string' }, // comma-separated
    status: { type: 'string', default: 'success' }, // success, failure, cancelled
  },
});

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const COMMENT_MARKER = '<!-- playwright-reports-bot -->';

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

if (!args.owner || !args.repo || !args.pr || !args.runId || !args.pagesUrl) {
  console.error('Missing required arguments: --owner, --repo, --pr, --runId, --pagesUrl');
  process.exit(1);
}

const API_BASE = 'https://api.github.com';
const headers = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

/**
 * Make GitHub API request
 */
async function githubApi(method, endpoint, body = null) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : null,
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
  
  return response.json();
}

/**
 * Find existing bot comment on the PR
 */
async function findExistingComment() {
  const comments = await githubApi(
    'GET',
    `/repos/${args.owner}/${args.repo}/issues/${args.pr}/comments?per_page=100`
  );
  
  return comments.find(c => c.body.includes(COMMENT_MARKER));
}

/**
 * Generate comment body
 */
function generateCommentBody() {
  const jobs = args.jobs ? args.jobs.split(',').filter(Boolean) : [];
  const reportsUrl = `${args.pagesUrl}/reports/pr/${args.pr}/${args.runId}`;
  const workflowUrl = `https://github.com/${args.owner}/${args.repo}/actions/runs/${args.runId}`;
  const commitUrl = `https://github.com/${args.owner}/${args.repo}/commit/${args.sha}`;
  
  const statusEmoji = {
    success: '✅',
    failure: '❌',
    cancelled: '⚠️',
  }[args.status] || '🔄';
  
  const statusText = {
    success: 'Tests completed',
    failure: 'Tests failed',
    cancelled: 'Tests cancelled',
  }[args.status] || 'Tests running';
  
  const jobLinks = jobs.map(job => {
    return `| ${job} | [View Report](${reportsUrl}/${job}/) |`;
  }).join('\n');
  
  const timestamp = new Date().toISOString();
  
  return `${COMMENT_MARKER}
## ${statusEmoji} Playwright E2E Test Reports

${statusText} for commit [\`${args.sha.slice(0, 7)}\`](${commitUrl})

### Reports

| Browser/Shard | Link |
|---------------|------|
${jobLinks}

<details>
<summary>Details</summary>

- **Workflow Run:** [#${args.runId}](${workflowUrl})
- **Commit:** [\`${args.sha.slice(0, 7)}\`](${commitUrl})
- **Updated:** ${timestamp}
- **Reports Index:** [View All Reports](${args.pagesUrl}/reports/)

</details>

---
<sub>🤖 This comment is automatically updated by the E2E workflow</sub>`;
}

/**
 * Main execution
 */
async function main() {
  console.log(`Posting PR comment for PR #${args.pr}`);
  
  try {
    const commentBody = generateCommentBody();
    const existingComment = await findExistingComment();
    
    if (existingComment) {
      // Update existing comment
      await githubApi(
        'PATCH',
        `/repos/${args.owner}/${args.repo}/issues/comments/${existingComment.id}`,
        { body: commentBody }
      );
      console.log(`Updated existing comment: ${existingComment.html_url}`);
    } else {
      // Create new comment
      const newComment = await githubApi(
        'POST',
        `/repos/${args.owner}/${args.repo}/issues/${args.pr}/comments`,
        { body: commentBody }
      );
      console.log(`Created new comment: ${newComment.html_url}`);
    }
    
    console.log('Done!');
  } catch (error) {
    console.error('Failed to post comment:', error.message);
    // Don't fail the workflow if comment posting fails
    process.exit(0);
  }
}

main();
