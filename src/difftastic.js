import fs from 'fs';  
import { execSync } from 'child_process';  
  
/**  
 * Analyzes code changes using Difftastic with structural change detection  
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
  
    // Run Difftastic with JSON output to get structural change line numbers  
    const jsonOutput = execSync(`difft --display json ${baseDir} ${headDir}`, {  
      encoding: 'utf8',  
      timeout: 30000,  
      maxBuffer: 10 * 1024 * 1024  
    });  
  
    // Run Difftastic with inline output for human-readable display  
    const inlineOutput = execSync(`difft --display inline ${baseDir} ${headDir}`, {  
      encoding: 'utf8',  
      timeout: 30000,  
      maxBuffer: 10 * 1024 * 1024  
    });  
  
    // Parse JSON output to extract line numbers with structural changes  
    const structuralLines = parseStructuralChanges(jsonOutput);  
      
    // Truncate inline output if too long for GitHub comment  
    const maxLength = 50000;  
    const finalOutput = inlineOutput.length > maxLength   
      ? inlineOutput.substring(0, maxLength) + '\n\n... (Diff truncated)'   
      : inlineOutput;  
  
    // Build result with summary  
    let result = `\`\`\`diff\n${finalOutput}\n\`\`\``;  
      
    if (structuralLines.length > 0) {  
      result += `\n\n## 🏗️ Structural Change Summary\n\n`;  
      result += `Changes on line numbers ${structuralLines.join(', ')} have structural changes`;  
    }  
  
    return result;  
  
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
  
function parseStructuralChanges(jsonOutput) {  
  try {  
    const data = JSON.parse(jsonOutput);  
    const structuralLines = new Set();  
      
    // Process each file in the JSON output  
    for (const file of data) {  
      if (file.chunks) {  
        for (const chunk of file.chunks) {  
          for (const line of chunk) {  
            // Extract RHS (new file) line numbers that have structural changes  
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
