import fs from 'fs';
import { execSync } from 'child_process';

export async function analyzeWithDifftastic(pr, repo, token) {
  const tempDir = `/tmp/difftastic-${pr.number}-${Date.now()}`;
  const baseDir = `${tempDir}/base`;
  const headDir = `${tempDir}/head`;

  try {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(headDir, { recursive: true });

    const getAuthUrl = (url) => url.replace('https://', `https://x-access-token:${token}@`);
    const baseRepoUrl = getAuthUrl(repo.clone_url);

    const isFork = pr.head.repo.full_name !== repo.full_name;
    const headRepoUrl = getAuthUrl(isFork ? pr.head.repo.clone_url : repo.clone_url);

    execSync(`git clone --depth=1 --branch ${pr.base.ref} ${baseRepoUrl} ${baseDir}`, {
      stdio: 'pipe',
      timeout: 60000
    });

    execSync(`git clone --depth=1 --branch ${pr.head.ref} ${headRepoUrl} ${headDir}`, {
      stdio: 'pipe',
      timeout: 60000
    });

    const difftasticEnv = { ...process.env, DFT_UNSTABLE: 'yes' }; // ← key fix

    // Run inline diff first (always works, no unstable flag needed)
    const inlineOutput = execSync(`difft --display inline ${baseDir} ${headDir}`, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: difftasticEnv
    });

    // Try JSON separately — don't let it kill the whole function
    let structuralLines = [];
    try {
      const jsonOutput = execSync(`difft --display json ${baseDir} ${headDir}`, {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        env: difftasticEnv  // ← passes DFT_UNSTABLE=yes
      });
      structuralLines = parseStructuralChanges(jsonOutput);
    } catch (jsonError) {
      console.error('JSON diff failed, skipping structural summary:', jsonError.message);
    }

    const maxLength = 50000;
    const finalOutput = inlineOutput.length > maxLength
      ? inlineOutput.substring(0, maxLength) + '\n\n... (Diff truncated)'
      : inlineOutput;

    let result = `\`\`\`diff\n${finalOutput}\n\`\`\``;

    if (structuralLines.length > 0) {
      result += `\n\n## Change Summary\n\n`;
      result += `Changes on line numbers ${structuralLines.join(', ')} might lead to change in the runtime behaviour`;
    }

    return result;

  } catch (error) {
    console.error('Difftastic execution failed:', error.message);
    return null;
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function parseStructuralChanges(jsonOutput) {
  try {
    const data = JSON.parse(jsonOutput);
    const structuralLines = new Set();

    for (const file of data) {
      if (file.chunks) {
        for (const chunk of file.chunks) {
          for (const line of chunk) {
            if (line.rhs && line.rhs.line_number) {
              structuralLines.add(line.rhs.line_number);
            }
          }
        }
      }
    }

    return Array.from(structuralLines).sort((a, b) => a - b);
  } catch (error) {
    console.error('Failed to parse JSON output:', error.message);
    return [];
  }
}
