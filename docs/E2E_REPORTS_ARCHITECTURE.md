# E2E Test Reports Architecture

This document describes the GitHub Pages deployment system for Playwright E2E test reports.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GitHub Pages Site                                   │
│  https://<owner>.github.io/<repo>/                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  /                         → React app (your main application)              │
│  /reports/                 → Reports landing page (auto-generated)          │
│  /reports/pr/<PR>/<RUN>/<JOB>/  → PR test reports                          │
│  /reports/scheduled/<ENV>/<DATE>/<RUN>/<SUITE>/ → Scheduled reports        │
│  /manifest.json            → Report metadata & index                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
gh-pages branch:
├── index.html              # Main app entry point
├── assets/                 # App build assets
├── manifest.json           # Reports metadata
├── .nojekyll              # Disable Jekyll processing
└── reports/
    ├── index.html          # Reports landing page (auto-generated)
    ├── pr/
    │   ├── 123/            # PR number
    │   │   ├── 456789/     # Run ID
    │   │   │   ├── chromium/
    │   │   │   │   └── index.html
    │   │   │   ├── firefox/
    │   │   │   │   └── index.html
    │   │   │   └── webkit/
    │   │   │       └── index.html
    │   │   └── 456790/     # Another run
    │   │       └── ...
    │   └── 124/            # Another PR
    │       └── ...
    └── scheduled/
        ├── stage/
        │   └── 2024-01-15/
        │       └── 789012/
        │           ├── smoke/
        │           │   └── index.html
        │           └── regression/
        │               └── index.html
        └── prod/
            └── 2024-01-15/
                └── ...
```

## Workflow Architecture

### PR Workflow (`e2e-pr.yml`)

```
┌──────────────────────────────────────────────────────────────────┐
│                         PR Opened/Updated                         │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    E2E Test Matrix (5 jobs)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ chromium │ │ firefox  │ │ webkit   │ │ mobile-  │ │mobile- │ │
│  │          │ │          │ │          │ │ chrome   │ │safari  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       │            │            │            │           │       │
│       ▼            ▼            ▼            ▼           ▼       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Upload Artifacts (per job)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Deploy Reports Job                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 1. Download all artifacts                                   │  │
│  │ 2. Checkout gh-pages branch                                 │  │
│  │ 3. Copy reports to: /reports/pr/<PR>/<RUN>/<JOB>/          │  │
│  │ 4. Update manifest.json                                     │  │
│  │ 5. Prune old reports (keep last 20 per PR)                  │  │
│  │ 6. Generate index.html                                      │  │
│  │ 7. Deploy to gh-pages                                       │  │
│  │ 8. Post/update PR comment with links                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Scheduled Workflow (`e2e-scheduled.yml`)

```
┌──────────────────────────────────────────────────────────────────┐
│              Daily Cron (3 AM stage, 4 AM prod)                   │
│                    OR Manual Trigger                              │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Setup Matrix Configuration                       │
│     Determine: environments=[stage/prod], suites=[smoke/regr]    │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                E2E Test Matrix (env × suite)                      │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐        │
│  │ stage/smoke    │ │ stage/regress  │ │ prod/smoke     │  ...   │
│  └───────┬────────┘ └───────┬────────┘ └───────┬────────┘        │
│          │                  │                  │                  │
│          ▼                  ▼                  ▼                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Upload Artifacts (per job)                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Deploy Reports Job                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Same as PR workflow, but:                                   │  │
│  │ - Path: /reports/scheduled/<ENV>/<DATE>/<RUN>/<SUITE>/     │  │
│  │ - Keep last 30 per environment                              │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Race Condition Prevention

### Concurrency Groups

```yaml
# PR workflow - prevent concurrent deploys for same PR
concurrency:
  group: e2e-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: false

# Deploy job - global lock for gh-pages
concurrency:
  group: gh-pages-deploy
  cancel-in-progress: false
```

### How It Works

1. **PR-level concurrency**: Multiple pushes to same PR queue up (don't cancel)
2. **Deploy-level concurrency**: All deployments (PR + scheduled) use same group
3. **Atomic updates**: `peaceiris/actions-gh-pages` does atomic git push
4. **Manifest-based state**: No filesystem race - state in JSON file

## Retention & Cleanup

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `KEEP_PR_RUNS` | 20 | Max runs to keep per PR |
| `KEEP_SCHEDULED_PER_ENV` | 30 | Max runs to keep per environment |
| `GLOBAL_CAP` | 500 | Absolute max reports across all |

### Cleanup Algorithm

```javascript
// 1. Per-PR pruning
for each PR:
  sort runs by timestamp DESC
  while runs.length > KEEP_PR_RUNS:
    delete oldest run

// 2. Per-environment pruning
for each env (stage, prod):
  sort runs by timestamp DESC
  while runs.length > KEEP_SCHEDULED_PER_ENV:
    delete oldest run

// 3. Global cap
all_reports = [...all_pr_runs, ...all_scheduled_runs]
sort all_reports by timestamp DESC
while all_reports.length > GLOBAL_CAP:
  delete oldest report
```

## URL Examples

### PR Reports

```
# PR #123, run 456789, chromium browser
https://owner.github.io/repo/reports/pr/123/456789/chromium/

# PR #123, run 456789, mobile safari
https://owner.github.io/repo/reports/pr/123/456789/mobile-safari/
```

### Scheduled Reports

```
# Stage environment, 2024-01-15, run 789012, smoke tests
https://owner.github.io/repo/reports/scheduled/stage/2024-01-15/789012/smoke/

# Prod environment, 2024-01-15, run 789012, regression tests
https://owner.github.io/repo/reports/scheduled/prod/2024-01-15/789012/regression/
```

### Index Pages

```
# Main reports index (landing page)
https://owner.github.io/repo/reports/

# Main app
https://owner.github.io/repo/
```

## Manifest Structure

```json
{
  "pr": {
    "123": [
      {
        "runId": "456789",
        "timestamp": "2024-01-15T10:30:00Z",
        "sha": "abc123def",
        "branch": "feature/new-thing",
        "actor": "developer",
        "jobs": ["chromium", "firefox", "webkit"],
        "url": "/reports/pr/123/456789"
      }
    ]
  },
  "scheduled": {
    "stage": [
      {
        "runId": "789012",
        "date": "2024-01-15",
        "timestamp": "2024-01-15T03:00:00Z",
        "sha": "def456ghi",
        "jobs": ["smoke", "regression"],
        "url": "/reports/scheduled/stage/2024-01-15/789012"
      }
    ],
    "prod": []
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00Z",
    "totalReports": 42
  }
}
```

## Fork PR Handling

### Security Concern

Fork PRs run with `pull_request` event which:
- Has read-only `GITHUB_TOKEN`
- Cannot deploy to gh-pages
- Cannot post PR comments

### Solution Options

1. **Option A: Allow fork deployments** (if reports are public anyway)
   - Use `pull_request_target` event
   - Explicit checkout of PR head SHA
   - Be careful: PR code runs in privileged context

2. **Option B: Skip fork deploys**
   - Check `github.event.pull_request.head.repo.fork`
   - Upload artifacts only (no deploy)
   - Maintainers can manually trigger deploy

3. **Option C: Separate deploy workflow**
   - Test workflow uploads artifacts
   - Deploy workflow triggered on `workflow_run` completion
   - Runs in base repo context

Current implementation uses Option A with explicit SHA checkout.

## Troubleshooting

### Reports not appearing

1. Check if gh-pages branch exists
2. Check GitHub Pages settings (Settings → Pages)
3. Check workflow run logs for errors
4. Verify artifacts were uploaded

### Concurrent deployment conflicts

1. Check concurrency group configuration
2. Look for "queued" workflows in Actions tab
3. Manually re-run failed deploy

### Old reports not cleaned up

1. Check retention settings in workflow env vars
2. Run cleanup manually: `node .github/scripts/update-manifest-and-prune.mjs --siteDir _site`
3. Check manifest.json for orphaned entries

### PR comment not appearing

1. Check workflow has `pull-requests: write` permission
2. Check GITHUB_TOKEN has correct scopes
3. Look for errors in post-pr-comment.mjs output
