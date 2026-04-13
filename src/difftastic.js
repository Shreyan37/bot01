    // src/difftastic.js
import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Analyzes code changes using Difftastic
 */
export async function analyzeWithDifftastic(pr, repo, token) {
  const tempDir = `/tmp/difftastic-${pr.number}-${Date.now()}`;
  const baseDir = `${tempDir}/base`;
  const headDir = `${tempDir}/head`;

  try {
    // Create directories
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(headDir, { recursive: true });

    // Helper to inject token into Git URL
    const getAuthUrl = (url) => url.replace('https://', `https://x-access-token:${token}@`);

    // Setup URLs
    const baseRepoUrl = getAuthUrl(repo.clone_url);
    
    // Handle Forks: If the PR comes from a fork, we must clone from the fork's URL
    const isFork = pr.head.repo.full_name !== repo.full_name;
    const headRepoUrl = getAuthUrl(isFork ? pr.head.repo.clone_url : repo.clone_url);

    // Clone Base
    execSync(`git clone --depth=1 --branch ${pr.base.ref} ${baseRepoUrl} ${baseDir}`, {
      stdio: 'pipe',
      timeout: 60000
    });

    // Clone Head
    execSync(`git clone --depth=1 --branch ${pr.head.ref} ${headRepoUrl} ${headDir}`, {
      stdio: 'pipe',
      timeout: 60000
    });

    // Run Difftastic
    const output = execSync(`difft --display=inline ${baseDir} ${headDir} --color=never`, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
    });

    // Truncate if too long for GitHub comment
    const maxLength = 50000;
    const finalOutput = output.length > maxLength 
      ? output.substring(0, maxLength) + '\n\n... (Diff truncated)' 
      : output;

    return `\`\`\`diff\n${finalOutput}\n\`\`\``;

  } catch (error) {
    console.error('Difftastic execution failed:', error.message);
    return null;
  } finally {
    // Cleanup temp directories
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
