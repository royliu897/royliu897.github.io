# Writing and comment service setup

The website stays on GitHub Pages. Visitors sign in through an identity-only OAuth app with **no requested scopes**. Their tokens are used only to check their GitHub identity. A separate GitHub App, installed only on the website repository, writes comments with **Issues: read and write** and **Contents: read and write** permissions. Contents access enables owner-only article publishing; comment requests receive Issues-only installation tokens. Visitors do not install that App or give it access to their repositories.

The site shows each visitor's linked username. GitHub itself shows the App bot as the author of new comments. A signed record inside each comment associates it with the authenticated visitor. The Worker checks that record before displaying the visitor identity or permitting edits.

## Upgrade from the original editor

Your Cloudflare domain and existing discussion issues can stay unchanged. No database or comment migration is required.

1. Create a **new identity-only OAuth app** using the settings below. Reusing the old app can retain previously granted `public_repo` access. The Worker rejects any token with nonempty scopes.
2. Create and install the separate writer GitHub App, then add its credentials and the attribution secret to Cloudflare.
3. Replace the OAuth client ID and secret, keep your session secret, and redeploy the Worker. Publish the accompanying `comments.js` change too.
4. Everyone signs in again. The new session cookie deliberately does not accept old write-capable OAuth sessions.
5. Delete the old OAuth app registration when it is no longer used. Anyone who granted the previous app access can also revoke it in GitHub Settings → Applications → Authorized OAuth Apps. Changing requested scopes alone does not revoke old grants.

Existing messages remain visible with their original authors and timestamps. Messages posted through the new App can be edited on the website. Older messages still belong to their original GitHub users and have an **Edit on GitHub** link for their owner. The new service does not use visitors' credentials to modify those messages.

## Domain and discussion threads

Use `comments.royrliu.com` for the Worker and `https://royrliu.com` for the website. The custom domain requires an active Cloudflare DNS zone. Keep the existing GitHub Pages DNS records. The same-site subdomain avoids third-party cookies. A `workers.dev` hostname is not a drop-in replacement.

`wrangler.toml` maps `lennar` to issue #1 and `lennar-full` to issue #2. Keep the repository public with Issues enabled. Pages published through `/write.html` create their own discussion issue and are registered in `writing-pages.json`; no new `PAGES_JSON` entry or Worker redeploy is needed. Keep the existing Lennar entries unchanged. Manually authored pages still need an issue, a `PAGES_JSON` entry and comment markup.

## Identity-only OAuth app

Open GitHub Settings → Developer settings → OAuth Apps → New OAuth App.

- Application name: `Roy Liu Writing Sign-in`
- Homepage URL: `https://royrliu.com`
- Authorization callback URL: `https://comments.royrliu.com/auth/callback`

Generate a client secret. Store the client ID as `GITHUB_CLIENT_ID` and the secret as `GITHUB_CLIENT_SECRET` in Cloudflare. The Worker explicitly sends an empty scope and accepts only a token reporting no scopes. No email, private profile or repository permissions are needed.

## Repository writer GitHub App

Open GitHub Settings → Developer settings → GitHub Apps → New GitHub App.

- Choose a unique name, such as `Roy Liu Writing Comments`.
- Homepage URL: `https://royrliu.com`.
- Disable webhooks. This App needs no user authorization callback or OAuth client secret.
- Repository permissions: **Issues: Read and write** and **Contents: Read and write**. Metadata read access is automatic. Leave Administration, Workflows, account and organization permissions unset. If the App already exists, approve its updated installation permissions.
- Limit installation to your account, then install it on **Only select repositories → royliu897.github.io**.

Record the App ID from its settings and the installation ID from the installation's URL (`github.com/settings/installations/NUMBER`). Store these as `GITHUB_APP_ID` and `GITHUB_INSTALLATION_ID`.

Generate and download a private key. GitHub's key may be PKCS#1. The Worker requires PKCS#8, so convert it locally:

```sh
openssl pkcs8 -topk8 -nocrypt -in /path/to/downloaded-key.pem -out /path/to/writing-app-pkcs8.pem
```

Keep both files outside the repository. Upload the converted key as shown below, then store or securely remove your local copies. Never put keys or secrets in chat, HTML, website JavaScript or `wrangler.toml`.

## Secrets and deployment

With current Node.js LTS, run from `comments-worker`:

```sh
npx wrangler@4 login
npx wrangler@4 secret put GITHUB_CLIENT_ID
npx wrangler@4 secret put GITHUB_CLIENT_SECRET
npx wrangler@4 secret put GITHUB_APP_ID
npx wrangler@4 secret put GITHUB_INSTALLATION_ID
npx wrangler@4 secret put GITHUB_APP_PRIVATE_KEY < /path/to/writing-app-pkcs8.pem
npx wrangler@4 secret put ATTRIBUTION_SECRET
npx wrangler@4 deploy
```

Generate `ATTRIBUTION_SECRET` with `openssl rand -hex 32` and enter it at the prompt. Keep a secure backup. It must remain stable to verify existing comment authorship. **Do not rotate it casually**. A key rotation would need a separate migration or key-versioning change.

For a fresh installation, also generate a different random value for `SESSION_SECRET` and run `npx wrangler@4 secret put SESSION_SECRET`. Existing installations can keep this secret. Rotating the session secret signs everyone out without affecting stored attribution.

The Worker signs a short-lived App JWT, exchanges it for an installation token restricted to the configured repository and the permissions needed for each operation (Issues write for comments, Contents read for page lookup and preview, Contents write plus Issues write for publishing), and caches that token until shortly before expiry. All writes use the installation token, never the visitor's token.

Deploy into the Cloudflare account containing the domain. Changing origins requires updating the Worker variables, article `data-api` attributes and OAuth callback. Do not use wildcard CORS.

If the service is unavailable, the public GitHub fallback still displays comments but cannot verify App attribution. New comments then show the bot's identity, not an unverified visitor name, and App-posted trade updates appear with comments until the Worker returns. Posting and editing are disabled.

## Owner-only writing

Open `https://royrliu.com/write.html` (also linked from the Writing footer) and sign in as `royliu897`. The server checks numeric account ID `124701324` for every author request. Other accounts cannot preview, load source or publish through author endpoints. Visitor OAuth still requests no scopes.

Drafts autosave only in this browser, on this device. Use **Download draft** and **Import draft** for backups or moving between devices. Drafts are not uploaded until Preview or Publish; preview sends the Markdown to GitHub for rendering without committing it. Clearing browser data removes local drafts. On a shared browser, local drafts remain after sign-out.

Enter a title, address, summary and Markdown article. Choose Investment thesis for comments plus author trade updates, or Full analysis / Note for comments alone. Preview uses the site's styles. Publish confirms the public address, then commits the article HTML, Markdown source JSON, registry and writing index together. Both the article and its source become public. Existing hand-written pages and their discussions are preserved. Editor-published pages can be reopened from Published and updated without changing their original publication date or discussion.

Publish targets `PUBLISH_BRANCH` (`main`). GitHub Pages must serve that branch and the repository root, and branch rules must allow this App to update it. A concurrent branch change fails safely without force-pushing; reopen the published version to resolve a stale article revision. Failed requests retain the local draft. If the response is lost after a successful commit, refresh Published before retrying. Issue creation happens before the commit: a failed commit can leave an empty discussion, which a sequential retry reuses. Simultaneous first publishes can leave an extra empty issue; delete that unused issue in GitHub if needed.

Deploy the static editor files, `writing-pages.json`, the publishing markers in `blog.html`, and the Worker module `publishing.mjs` together. Live GitHub App permissions and the Pages build trigger must be verified after credentials are configured: publish a small test note, confirm it appears on the writing index, post a comment, then reopen and update it. Automated tests mock GitHub and do not prove deployment success.

## Verify on the live site

1. Use a visitor account. GitHub's consent screen must not request public repository access or installing an App on the visitor's repositories.
2. Post and edit a comment. The website should show the visitor's username. GitHub should show the writer App bot.
3. Sign in as `royliu897`. The trade-update form appears on the short thesis only. Enter `Bought 10 shares @ $76.43` without a marker.
4. Sign in with another account. Only its new messages have Edit buttons and the update form is absent.
5. Old messages retain their authors and dates. Their owners can follow **Edit on GitHub**.
6. Sign out and check both articles on mobile. Messages remain readable and posting is disabled.

Delete test comments through GitHub. Keep the existing issues. GitHub remains the moderation interface for deletion and thread locking.

## Security and limits

OAuth uses PKCE and browser-bound state. Identity tokens are encrypted in Secure, HttpOnly, host-only cookies and never returned to JavaScript or placed in local storage. Sessions last at most eight hours or until token expiry. Sign-out clears the cookie but does not revoke OAuth authorization.

Writes require the exact website Origin and JSON. The Worker rechecks GitHub identity for every write. Trade updates require numeric account ID `124701324`. Authorship records are HMAC-signed over the identity, repository, discussion and message text. They are accepted only on comments posted by the configured GitHub App bot. Copying the record into a normal GitHub comment does not establish ownership. Invalid records never grant editing rights. Do not directly edit App comment bodies on GitHub, because that invalidates their attribution. Delete them for moderation instead.

The browser sanitizes GitHub-rendered Markdown. GitHub supplies creation and edit timestamps. Those timestamps do not verify trade execution or make messages immutable. The site owner controls the service and its signing key.

GitHub and Cloudflare limits apply. All visitors share the writer App's API quota. Configure Cloudflare rate limiting for login and mutation endpoints before opening the service to substantial traffic. There are no automatic write retries. Do not log cookies, tokens or OAuth callback queries.

## Tests

From the repository root, with Node.js 22 or newer:

```sh
node tests/comments-worker.mjs
node tests/publishing.mjs
python3 tests/writing.py
node tests/reading-progress.cjs
```

With Python Playwright and Chromium installed, run `python3 tests/comments.py` and `python3 tests/editor.py`.

Tests mock GitHub. Live consent, App installation, cookies and posting must be checked after deployment.

References: [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps), [installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [GitHub issue comments](https://docs.github.com/en/rest/issues/comments), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
