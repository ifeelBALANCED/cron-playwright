#!/usr/bin/env node
/**
 * generate-index.mjs
 * 
 * Generates the landing page HTML for the reports site.
 * Reads manifest.json and creates a beautiful, navigable index.
 * 
 * Usage:
 *   node generate-index.mjs --siteDir _site --repoUrl "https://github.com/owner/repo"
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    siteDir: { type: 'string', default: '_site' },
    repoUrl: { type: 'string', default: '' },
    pagesUrl: { type: 'string', default: '' },
  },
});

const SITE_DIR = args.siteDir;
const REPO_URL = args.repoUrl;
const PAGES_URL = args.pagesUrl;
const MANIFEST_PATH = path.join(SITE_DIR, 'manifest.json');
const OUTPUT_PATH = path.join(SITE_DIR, 'reports', 'index.html');

/**
 * Load manifest
 */
function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('Failed to load manifest:', e.message);
  }
  return { pr: {}, scheduled: { stage: [], prod: [] }, metadata: {} };
}

/**
 * Format date for display
 */
function formatDate(isoString) {
  if (!isoString) return 'Unknown';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Generate HTML for a single PR's runs
 */
function generatePrSection(prNumber, runs) {
  const prUrl = REPO_URL ? `${REPO_URL}/pull/${prNumber}` : '#';
  
  const runsHtml = runs.slice(0, 10).map(run => {
    const firstJob = run.jobs?.[0];
    const primaryHref = firstJob ? `${run.url}/${firstJob}/` : run.url + '/';
    const jobLinks = (run.jobs || []).map(job =>
      `<a href="${run.url}/${job}/" class="job-link" title="View ${job} report">${job}</a>`
    ).join('');
    
    const shaLink = REPO_URL && run.sha && run.sha !== 'unknown'
      ? `<a href="${REPO_URL}/commit/${run.sha}" class="sha" target="_blank" rel="noopener">${run.sha.slice(0, 7)}</a>`
      : `<span class="sha">${(run.sha || 'unknown').slice(0, 7)}</span>`;
    
    const runLink = REPO_URL
      ? `<a href="${REPO_URL}/actions/runs/${run.runId}" class="run-id" target="_blank" rel="noopener">#${run.runId}</a>`
      : `<span class="run-id">#${run.runId}</span>`;
    
    return `
      <div class="run-entry">
        <div class="run-header">
          <span class="run-meta">${runLink} · ${shaLink}</span>
          <span class="run-time">${formatDate(run.timestamp)}</span>
        </div>
        <div class="run-actions">
          <a href="${primaryHref}" class="btn-primary" title="Open Playwright HTML report">View report</a>
          ${run.url ? `<a href="${run.url}/" class="btn-secondary" title="Browse all browser reports">All browsers</a>` : ''}
        </div>
        <div class="job-links" aria-label="Reports by browser">${jobLinks}</div>
        ${run.branch ? `<div class="branch-info">Branch: <code>${run.branch}</code></div>` : ''}
      </div>
    `;
  }).join('');
  
  return `
    <section class="pr-section" aria-labelledby="pr-${prNumber}-title">
      <h2 id="pr-${prNumber}-title" class="pr-title">
        <a href="${prUrl}" target="_blank" rel="noopener">PR #${prNumber}</a>
        <span class="run-count">(${runs.length} run${runs.length !== 1 ? 's' : ''})</span>
      </h2>
      <div class="runs-list">${runsHtml}</div>
    </section>
  `;
}

/**
 * Generate HTML for scheduled runs
 */
function generateScheduledSection(env, runs) {
  const runsHtml = runs.slice(0, 15).map(run => {
    const firstJob = run.jobs?.[0];
    const primaryHref = firstJob ? `${run.url}/${firstJob}/` : run.url + '/';
    const jobLinks = (run.jobs || []).map(job =>
      `<a href="${run.url}/${job}/" class="job-link" title="View ${job} report">${job}</a>`
    ).join('');
    
    const shaLink = REPO_URL && run.sha && run.sha !== 'unknown'
      ? `<a href="${REPO_URL}/commit/${run.sha}" class="sha" target="_blank" rel="noopener">${run.sha.slice(0, 7)}</a>`
      : `<span class="sha">${(run.sha || 'unknown').slice(0, 7)}</span>`;
    
    const runLink = REPO_URL
      ? `<a href="${REPO_URL}/actions/runs/${run.runId}" class="run-id" target="_blank" rel="noopener">#${run.runId}</a>`
      : `<span class="run-id">#${run.runId}</span>`;
    
    return `
      <div class="run-entry">
        <div class="run-header">
          <span class="run-meta">${run.date} · ${runLink} · ${shaLink}</span>
          <span class="run-time">${formatDate(run.timestamp)}</span>
        </div>
        <div class="run-actions">
          <a href="${primaryHref}" class="btn-primary" title="Open Playwright HTML report">View report</a>
          ${run.url ? `<a href="${run.url}/" class="btn-secondary" title="Browse all suite reports">All suites</a>` : ''}
        </div>
        <div class="job-links" aria-label="Reports by suite">${jobLinks}</div>
      </div>
    `;
  }).join('');
  
  return `
    <section class="env-section" aria-labelledby="env-${env}-title">
      <h2 id="env-${env}-title" class="env-title">
        <span class="env-badge env-${env}">${env.toUpperCase()}</span>
        <span class="run-count">(${runs.length} run${runs.length !== 1 ? 's' : ''})</span>
      </h2>
      <div class="runs-list">${runsHtml}</div>
    </section>
  `;
}

/**
 * Generate the full HTML page
 */
function generateHtml(manifest) {
  const sortedPrs = Object.entries(manifest.pr)
    .filter(([, runs]) => runs.length > 0)
    .sort((a, b) => {
      const aTime = a[1][0]?.timestamp || '';
      const bTime = b[1][0]?.timestamp || '';
      return new Date(bTime) - new Date(aTime);
    });
  
  const prSections = sortedPrs.length > 0
    ? sortedPrs.map(([pr, runs]) => generatePrSection(pr, runs)).join('')
    : '<p class="empty-state">No PR reports yet</p>';
  
  const scheduledSections = Object.entries(manifest.scheduled)
    .filter(([, runs]) => runs.length > 0)
    .map(([env, runs]) => generateScheduledSection(env, runs))
    .join('');
  
  const emptyScheduled = scheduledSections === '' 
    ? '<p class="empty-state">No scheduled reports yet</p>' 
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E2E Test Reports</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --border-color: #30363d;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-yellow: #d29922;
      --accent-purple: #a371f7;
      --accent-red: #f85149;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    
    header {
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }
    
    h1 {
      font-size: 1.75rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    
    .subtitle {
      color: var(--text-secondary);
      font-size: 0.95rem;
    }
    
    .last-updated {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }
    
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0;
    }
    
    .tab {
      padding: 0.75rem 1.25rem;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.95rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: all 0.15s;
    }
    
    .tab:hover {
      color: var(--text-primary);
    }
    
    .tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent-blue);
    }
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
    
    .section-grid {
      display: grid;
      gap: 1.25rem;
    }
    
    .pr-section, .env-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem 1.25rem;
    }
    
    .pr-title, .env-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .pr-title a {
      color: var(--accent-blue);
      text-decoration: none;
    }
    
    .pr-title a:hover {
      text-decoration: underline;
    }
    
    .run-count {
      color: var(--text-muted);
      font-weight: 400;
      font-size: 0.85rem;
    }
    
    .env-badge {
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    
    .env-stage {
      background: rgba(210, 153, 34, 0.2);
      color: var(--accent-yellow);
    }
    
    .env-prod {
      background: rgba(63, 185, 80, 0.2);
      color: var(--accent-green);
    }
    
    .runs-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    
    .run-entry {
      padding: 0.75rem;
      background: var(--bg-tertiary);
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }
    
    .run-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    
    .run-meta {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    
    .run-id, .sha {
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 0.8rem;
    }
    
    .run-id {
      color: var(--accent-purple);
      text-decoration: none;
    }
    
    .run-id:hover {
      text-decoration: underline;
    }
    
    .sha {
      color: var(--text-muted);
      text-decoration: none;
    }
    
    a.sha:hover {
      color: var(--accent-blue);
    }
    
    .run-time {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    
    .job-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    
    .job-link {
      display: inline-block;
      padding: 0.3rem 0.65rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      text-decoration: none;
      font-size: 0.8rem;
      font-weight: 500;
      transition: all 0.15s;
    }
    
    .job-link:hover {
      background: var(--accent-blue);
      border-color: var(--accent-blue);
      color: white;
    }
    
    .branch-info {
      margin-top: 0.5rem;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    
    .branch-info code {
      background: var(--bg-secondary);
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    }
    
    .run-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    
    .btn-primary {
      display: inline-flex;
      align-items: center;
      padding: 0.4rem 0.9rem;
      background: var(--accent-blue);
      color: #fff;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.15s, box-shadow 0.15s;
    }
    
    .btn-primary:hover {
      background: #79b8ff;
    }
    
    .btn-primary:focus-visible {
      outline: 2px solid var(--accent-blue);
      outline-offset: 2px;
    }
    
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      padding: 0.4rem 0.75rem;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 0.8rem;
      text-decoration: none;
      transition: border-color 0.15s, color 0.15s;
    }
    
    .btn-secondary:hover {
      border-color: var(--accent-blue);
      color: var(--accent-blue);
    }
    
    .btn-secondary:focus-visible {
      outline: 2px solid var(--accent-blue);
      outline-offset: 2px;
    }
    
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    
    .breadcrumb a {
      color: var(--accent-blue);
      text-decoration: none;
    }
    
    .breadcrumb a:hover {
      text-decoration: underline;
    }
    
    .breadcrumb-sep {
      color: var(--text-muted);
    }
    
    .tabs-wrap {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--bg-primary);
      padding-top: 0.25rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }
    
    .tab:focus-visible {
      outline: 2px solid var(--accent-blue);
      outline-offset: 2px;
    }
    
    .skip-link {
      position: absolute;
      top: -2.5rem;
      left: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: var(--accent-blue);
      color: #fff;
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
      border-radius: 4px;
      z-index: 100;
      transition: top 0.15s;
    }
    
    .skip-link:focus {
      top: 0.5rem;
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    
    .empty-state {
      color: var(--text-muted);
      text-align: center;
      padding: 2rem;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px dashed var(--border-color);
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .stat-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    
    .stat-value {
      font-size: 1.75rem;
      font-weight: 600;
      color: var(--accent-blue);
    }
    
    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border-color);
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    
    footer a {
      color: var(--accent-blue);
      text-decoration: none;
    }
    
    footer a:hover {
      text-decoration: underline;
    }
    
    @media (max-width: 640px) {
      .container {
        padding: 1rem;
      }
      
      .run-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .stats {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  </style>
</head>
<body>
  <a href="#main" class="skip-link">Skip to reports</a>
  <div class="container">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${PAGES_URL ? `<a href="${PAGES_URL.replace(/\/$/, '')}/">App</a>` : ''}
      <span class="breadcrumb-sep">${PAGES_URL ? '/' : ''}</span>
      <span aria-current="page">Reports</span>
    </nav>
    
    <header>
      <h1>E2E Test Reports</h1>
      <p class="subtitle">Playwright test reports for pull requests and scheduled runs</p>
      <p class="last-updated">Last updated: ${formatDate(manifest.metadata?.lastUpdated)}</p>
    </header>
    
    <div class="stats" aria-label="Report summary">
      <div class="stat-card">
        <div class="stat-value">${sortedPrs.length}</div>
        <div class="stat-label">Active PRs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${manifest.metadata?.totalReports || 0}</div>
        <div class="stat-label">Total Reports</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${manifest.scheduled?.stage?.length || 0}</div>
        <div class="stat-label">Stage Runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${manifest.scheduled?.prod?.length || 0}</div>
        <div class="stat-label">Prod Runs</div>
      </div>
    </div>
    
    <div class="tabs-wrap">
      <div class="tabs" role="tablist" aria-label="Report type">
        <button type="button" class="tab active" data-tab="pr" role="tab" aria-selected="true" aria-controls="pr-panel" id="tab-pr">Pull Requests</button>
        <button type="button" class="tab" data-tab="scheduled" role="tab" aria-selected="false" aria-controls="scheduled-panel" id="tab-scheduled">Scheduled</button>
      </div>
    </div>
    
    <main id="main">
      <div id="pr-panel" class="tab-content active" role="tabpanel" aria-labelledby="tab-pr">
        <div class="section-grid">
          ${prSections}
        </div>
      </div>
      
      <div id="scheduled-panel" class="tab-content" role="tabpanel" aria-labelledby="tab-scheduled" hidden>
        <div class="section-grid">
          ${scheduledSections}
          ${emptyScheduled}
        </div>
      </div>
    </main>
    
    <footer>
      ${REPO_URL ? `<a href="${REPO_URL}" target="_blank" rel="noopener">View Repository</a> · ` : ''}
      Powered by <a href="https://playwright.dev" target="_blank" rel="noopener">Playwright</a>
    </footer>
  </div>
  
  <script>
{
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-content');

  const setTab = (activeTab) => {
    const tabId = activeTab.dataset.tab;
    tabs.forEach((t) => {
      const isActive = t === activeTab;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive);
    });
    panels.forEach((p) => {
      const isActive = p.id === tabId + '-panel';
      p.classList.toggle('active', isActive);
      p.hidden = !isActive;
    });
    try {
      window.location.hash = tabId;
    } catch (_) {}
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab));
    tab.addEventListener('keydown', (e) => {
      const idx = [...tabs].indexOf(tab);
      if (e.key === 'ArrowRight' && idx < tabs.length - 1) {
        e.preventDefault();
        setTab(tabs[idx + 1]);
        tabs[idx + 1].focus();
      }
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        setTab(tabs[idx - 1]);
        tabs[idx - 1].focus();
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setTab(tabs[0]);
        tabs[0].focus();
      }
      if (e.key === 'End') {
        e.preventDefault();
        setTab(tabs[tabs.length - 1]);
        tabs[tabs.length - 1].focus();
      }
    });
  });

  const hash = (window.location.hash || '#pr').slice(1);
  const byHash = document.querySelector(\`.tab[data-tab="\${hash}"]\`);
  if (byHash) setTab(byHash);

  window.addEventListener('hashchange', () => {
    const h = (window.location.hash || '#pr').slice(1);
    const tabEl = document.querySelector(\`.tab[data-tab="\${h}"]\`);
    if (tabEl) setTab(tabEl);
  });
}
  </script>
</body>
</html>`;
}

/**
 * Main execution
 */
function main() {
  console.log('=== Generating Index Page ===');
  
  const manifest = loadManifest();
  const html = generateHtml(manifest);
  
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  
  fs.writeFileSync(OUTPUT_PATH, html);
  
  console.log(`Generated: ${OUTPUT_PATH}`);
  console.log('=== Done ===');
}

main();
