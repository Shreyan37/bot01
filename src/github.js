import { createAppAuth } from "@octokit/auth-app";

/**
 * Creates an installation access token using the App's credentials
 */
export async function getInstallationToken(appId, privateKey, installationId) {
  const appAuth = createAppAuth({
    appId: appId,
    privateKey: privateKey,
  });

  const authentication = await appAuth({
    type: "installation",
    installationId: installationId,
  });

  return authentication.token;
}

/**
 * Posts a comment using .request() to avoid plugin path issues
 */
export async function createComment(octokit, owner, repo, issueNumber, body) {
  await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
    owner: owner,
    repo: repo,
    issue_number: issueNumber,
    body: body
  });
}
