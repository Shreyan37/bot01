import express from 'express';
import { App } from '@octokit/app';
import { createNodeMiddleware } from '@octokit/webhooks';
import dotenv from 'dotenv';
import fs from 'fs';
import { getInstallationToken, createComment } from './github.js';
import { analyzeWithDifftastic } from './difftastic.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Load GitHub App Private Key (needed for token generation)
const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH || './private-key.pem', 'utf8');
const appId = process.env.APP_ID;

const githubApp = new App({
  appId: appId,
  privateKey: privateKey,
  webhooks: { secret: process.env.WEBHOOK_SECRET },
});

githubApp.webhooks.on('pull_request.opened', handlePullRequest);
githubApp.webhooks.on('pull_request.synchronize', handlePullRequest);

async function handlePullRequest({ payload }) {
  const { pull_request, repository, installation } = payload;
  console.log(`📝 Processing PR #${pull_request.number}`);

  try {
    // 1. Get the RAW TOKEN for Git operations
    // We use the App's credentials here (Master Key)
    const gitToken = await getInstallationToken(appId, privateKey, installation.id);

    // 2. Get the OCTOKIT CLIENT for API operations (Comments)
    // We use the Installation ID here (Repo Access)
    const octokit = await githubApp.getInstallationOctokit(installation.id);

    // 3. Analyze with the RAW TOKEN
    const diffBody = await analyzeWithDifftastic(pull_request, repository, gitToken);

    // 4. Comment with the OCTOKIT CLIENT
    if (diffBody) {
      await createComment(
        octokit, 
        repository.owner.login, 
        repository.name, 
        pull_request.number, 
        `## 🧠 Structural Diff\n\n${diffBody}\n\n---\n*Powered by PRNotifier1*`
      );
      console.log(`✅ Commented on PR #${pull_request.number}`);
    }
  } catch (error) {
    console.error('❌ Error in handler:', error.message);
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(createNodeMiddleware(githubApp.webhooks, { path: '/api/github/webhooks' }));

app.listen(port, () => {
  console.log(`🚀 Bot listening on port ${port}`);
});
