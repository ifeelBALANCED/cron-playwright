#!/usr/bin/env node
/**
 * update-manifest-and-prune.mjs
 * 
 * Updates the reports manifest.json and prunes old reports based on retention policy.
 * 
 * Usage:
 *   node update-manifest-and-prune.mjs \
 *     --siteDir _site \
 *     --keepPrRuns 20 \
 *     --keepScheduledPerEnv 30 \
 *     --globalCap 500 \
 *     [--addReport '{"type":"pr","pr":"123","run":"456","jobs":["chromium","webkit"],...}']
 * 
 * Manifest structure:
 * {
 *   "pr": {
 *     "123": [{ runId, timestamp, sha, jobs: [...], url }],
 *     "456": [...]
 *   },
 *   "scheduled": {
 *     "stage": [{ runId, date, timestamp, sha, jobs: [...], url }],
 *     "prod": [...]
 *   },
 *   "metadata": {
 *     "lastUpdated": "...",
 *     "totalReports": 123
 *   }
 * }
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    siteDir: { type: 'string', default: '_site' },
    keepPrRuns: { type: 'string', default: '20' },
    keepScheduledPerEnv: { type: 'string', default: '30' },
    globalCap: { type: 'string', default: '500' },
    addReport: { type: 'string' }, // JSON string for new report
  },
});

const SITE_DIR = args.siteDir;
const KEEP_PR_RUNS = parseInt(args.keepPrRuns, 10);
const KEEP_SCHEDULED_PER_ENV = parseInt(args.keepScheduledPerEnv, 10);
const GLOBAL_CAP = parseInt(args.globalCap, 10);
const MANIFEST_PATH = path.join(SITE_DIR, 'manifest.json');
const REPORTS_DIR = path.join(SITE_DIR, 'reports');

/**
 * Load existing manifest or create empty one
 */
function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    }
  } catch (e) {
    console.warn('Failed to load manifest, creating new one:', e.message);
  }
  
  return {
    pr: {},
    scheduled: {
      stage: [],
      prod: [],
    },
    metadata: {
      lastUpdated: new Date().toISOString(),
      totalReports: 0,
    },
  };
}

/**
 * Save manifest to file
 */
function saveManifest(manifest) {
  manifest.metadata.lastUpdated = new Date().toISOString();
  manifest.metadata.totalReports = countTotalReports(manifest);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Manifest saved: ${manifest.metadata.totalReports} total reports`);
}

/**
 * Count total report entries
 */
function countTotalReports(manifest) {
  let count = 0;
  
  // Count PR reports
  for (const prRuns of Object.values(manifest.pr)) {
    count += prRuns.length;
  }
  
  // Count scheduled reports
  for (const envRuns of Object.values(manifest.scheduled)) {
    count += envRuns.length;
  }
  
  return count;
}

/**
 * Scan existing reports directory and rebuild manifest
 * This ensures manifest stays in sync with actual files
 */
function scanExistingReports(manifest) {
  if (!fs.existsSync(REPORTS_DIR)) {
    return manifest;
  }

  // Scan PR reports: reports/pr/<PR_NUMBER>/<RUN_ID>/<JOB>/
  const prDir = path.join(REPORTS_DIR, 'pr');
  if (fs.existsSync(prDir)) {
    for (const prNumber of fs.readdirSync(prDir)) {
      const prPath = path.join(prDir, prNumber);
      if (!fs.statSync(prPath).isDirectory()) continue;
      
      if (!manifest.pr[prNumber]) {
        manifest.pr[prNumber] = [];
      }
      
      const existingRunIds = new Set(manifest.pr[prNumber].map(r => r.runId));
      
      for (const runId of fs.readdirSync(prPath)) {
        const runPath = path.join(prPath, runId);
        if (!fs.statSync(runPath).isDirectory()) continue;
        
        if (!existingRunIds.has(runId)) {
          // Discovered run not in manifest - add with basic info
          const jobs = fs.readdirSync(runPath).filter(j => 
            fs.statSync(path.join(runPath, j)).isDirectory()
          );
          
          const stat = fs.statSync(runPath);
          manifest.pr[prNumber].push({
            runId,
            timestamp: stat.mtime.toISOString(),
            sha: 'unknown',
            jobs,
            url: `/reports/pr/${prNumber}/${runId}`,
          });
        }
      }
    }
  }

  // Scan scheduled reports: reports/scheduled/<ENV>/<DATE>/<RUN_ID>/<JOB>/
  const scheduledDir = path.join(REPORTS_DIR, 'scheduled');
  if (fs.existsSync(scheduledDir)) {
    for (const env of fs.readdirSync(scheduledDir)) {
      const envPath = path.join(scheduledDir, env);
      if (!fs.statSync(envPath).isDirectory()) continue;
      
      if (!manifest.scheduled[env]) {
        manifest.scheduled[env] = [];
      }
      
      const existingRunIds = new Set(manifest.scheduled[env].map(r => r.runId));
      
      for (const date of fs.readdirSync(envPath)) {
        const datePath = path.join(envPath, date);
        if (!fs.statSync(datePath).isDirectory()) continue;
        
        for (const runId of fs.readdirSync(datePath)) {
          const runPath = path.join(datePath, runId);
          if (!fs.statSync(runPath).isDirectory()) continue;
          
          if (!existingRunIds.has(runId)) {
            const jobs = fs.readdirSync(runPath).filter(j =>
              fs.statSync(path.join(runPath, j)).isDirectory()
            );
            
            const stat = fs.statSync(runPath);
            manifest.scheduled[env].push({
              runId,
              date,
              timestamp: stat.mtime.toISOString(),
              sha: 'unknown',
              jobs,
              url: `/reports/scheduled/${env}/${date}/${runId}`,
            });
          }
        }
      }
    }
  }
  
  return manifest;
}

/**
 * Add a new report to the manifest
 */
function addNewReport(manifest, reportJson) {
  if (!reportJson) return manifest;
  
  const report = JSON.parse(reportJson);
  
  if (report.type === 'pr') {
    const { pr, runId, sha, jobs, timestamp, actor, branch } = report;
    
    if (!manifest.pr[pr]) {
      manifest.pr[pr] = [];
    }
    
    // Remove if already exists (re-run)
    manifest.pr[pr] = manifest.pr[pr].filter(r => r.runId !== runId);
    
    manifest.pr[pr].unshift({
      runId,
      timestamp: timestamp || new Date().toISOString(),
      sha,
      jobs,
      actor,
      branch,
      url: `/reports/pr/${pr}/${runId}`,
    });
    
    console.log(`Added PR #${pr} run ${runId} with jobs: ${jobs.join(', ')}`);
  } 
  else if (report.type === 'scheduled') {
    const { env, date, runId, sha, jobs, timestamp } = report;
    
    if (!manifest.scheduled[env]) {
      manifest.scheduled[env] = [];
    }
    
    // Remove if already exists (re-run)
    manifest.scheduled[env] = manifest.scheduled[env].filter(r => r.runId !== runId);
    
    manifest.scheduled[env].unshift({
      runId,
      date,
      timestamp: timestamp || new Date().toISOString(),
      sha,
      jobs,
      url: `/reports/scheduled/${env}/${date}/${runId}`,
    });
    
    console.log(`Added scheduled ${env} run ${runId} (${date}) with jobs: ${jobs.join(', ')}`);
  }
  
  return manifest;
}

/**
 * Prune old reports based on retention policy
 */
function pruneReports(manifest) {
  const toDelete = [];
  
  // Prune PR reports - keep KEEP_PR_RUNS per PR
  for (const [prNumber, runs] of Object.entries(manifest.pr)) {
    // Sort by timestamp descending
    runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    while (runs.length > KEEP_PR_RUNS) {
      const old = runs.pop();
      toDelete.push({
        path: path.join(REPORTS_DIR, 'pr', prNumber, old.runId),
        desc: `PR #${prNumber} run ${old.runId}`,
      });
    }
    
    // If PR has no runs left, clean up
    if (runs.length === 0) {
      delete manifest.pr[prNumber];
      toDelete.push({
        path: path.join(REPORTS_DIR, 'pr', prNumber),
        desc: `PR #${prNumber} (empty)`,
      });
    }
  }
  
  // Prune scheduled reports - keep KEEP_SCHEDULED_PER_ENV per environment
  for (const [env, runs] of Object.entries(manifest.scheduled)) {
    // Sort by timestamp descending
    runs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    while (runs.length > KEEP_SCHEDULED_PER_ENV) {
      const old = runs.pop();
      toDelete.push({
        path: path.join(REPORTS_DIR, 'scheduled', env, old.date, old.runId),
        desc: `Scheduled ${env} ${old.date}/${old.runId}`,
      });
    }
  }
  
  // Global cap - if still over, remove oldest across all
  let allReports = [];
  
  for (const [pr, runs] of Object.entries(manifest.pr)) {
    for (const run of runs) {
      allReports.push({ type: 'pr', pr, run, timestamp: new Date(run.timestamp) });
    }
  }
  
  for (const [env, runs] of Object.entries(manifest.scheduled)) {
    for (const run of runs) {
      allReports.push({ type: 'scheduled', env, run, timestamp: new Date(run.timestamp) });
    }
  }
  
  allReports.sort((a, b) => b.timestamp - a.timestamp);
  
  while (allReports.length > GLOBAL_CAP) {
    const oldest = allReports.pop();
    
    if (oldest.type === 'pr') {
      manifest.pr[oldest.pr] = manifest.pr[oldest.pr].filter(r => r.runId !== oldest.run.runId);
      toDelete.push({
        path: path.join(REPORTS_DIR, 'pr', oldest.pr, oldest.run.runId),
        desc: `PR #${oldest.pr} run ${oldest.run.runId} (global cap)`,
      });
    } else {
      manifest.scheduled[oldest.env] = manifest.scheduled[oldest.env].filter(r => r.runId !== oldest.run.runId);
      toDelete.push({
        path: path.join(REPORTS_DIR, 'scheduled', oldest.env, oldest.run.date, oldest.run.runId),
        desc: `Scheduled ${oldest.env} ${oldest.run.date}/${oldest.run.runId} (global cap)`,
      });
    }
  }
  
  // Actually delete the directories
  for (const item of toDelete) {
    if (fs.existsSync(item.path)) {
      fs.rmSync(item.path, { recursive: true, force: true });
      console.log(`Deleted: ${item.desc}`);
    }
  }
  
  // Clean up empty date directories for scheduled
  const scheduledDir = path.join(REPORTS_DIR, 'scheduled');
  if (fs.existsSync(scheduledDir)) {
    for (const env of fs.readdirSync(scheduledDir)) {
      const envPath = path.join(scheduledDir, env);
      if (!fs.statSync(envPath).isDirectory()) continue;
      
      for (const date of fs.readdirSync(envPath)) {
        const datePath = path.join(envPath, date);
        if (!fs.statSync(datePath).isDirectory()) continue;
        
        const contents = fs.readdirSync(datePath);
        if (contents.length === 0) {
          fs.rmdirSync(datePath);
          console.log(`Removed empty date directory: ${env}/${date}`);
        }
      }
    }
  }
  
  console.log(`Pruning complete. Deleted ${toDelete.length} report(s).`);
  return manifest;
}

/**
 * Main execution
 */
function main() {
  console.log('=== Report Manifest Update & Prune ===');
  console.log(`Site dir: ${SITE_DIR}`);
  console.log(`Retention: PR=${KEEP_PR_RUNS}, Scheduled/env=${KEEP_SCHEDULED_PER_ENV}, Global=${GLOBAL_CAP}`);
  
  // Ensure directories exist
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  
  // Load manifest
  let manifest = loadManifest();
  
  // Scan existing reports to ensure consistency
  manifest = scanExistingReports(manifest);
  
  // Add new report if provided
  if (args.addReport) {
    manifest = addNewReport(manifest, args.addReport);
  }
  
  // Prune old reports
  manifest = pruneReports(manifest);
  
  // Save updated manifest
  saveManifest(manifest);
  
  console.log('=== Done ===');
}

main();
