# Comment service setup

The website stays on GitHub Pages. This Worker handles GitHub login and authenticated writes. Existing GitHub issue comments are preserved. Nothing needs to be migrated from Utterances.

## Domain and discussion threads

Use `comments.royrliu.com` for the Worker and `https://royrliu.com` for the website. The custom domain requires an active Cloudflare DNS zone. Keep the existing GitHub Pages DNS records when setting up Cloudflare. A same-site subdomain avoids third-party cookies. A `workers.dev` hostname is not a drop-in replacement for this configuration.

`wrangler.toml` maps `lennar` to existing issue #1. For the full analysis, use its existing issue if one exists. Otherwise, create an issue titled `lennar-full` in `royliu897/royliu897.github.io`. Replace `"issue":0` with that issue number in `PAGES_JSON`. Until configured, that page returns an empty list and does not accept posts. Pre-created threads avoid duplicate issues from simultaneous first comments.

Keep the repository public with Issues enabled. Future articles need their own `PAGES_JSON` entry, GitHub issue and comment markup. Enable `updates` only on short investment theses. The deployed service uses explicit issue numbers, while the read-only fallback recognizes old Utterances pathname titles.

## GitHub OAuth app

Open GitHub Settings → Developer settings → OAuth Apps → New OAuth App.

- Application name: `Roy Liu Writing`
- Homepage URL: `https://royrliu.com`
- Authorization callback URL: `https://comments.royrliu.com/auth/callback`

Generate a client secret. Never put it in HTML, JavaScript, chat, this repository or `wrangler.toml`.

The app requests `public_repo` to post and edit issue comments as the visitor. **This GitHub OAuth scope is broader than comments and can permit changes to the visitor's public repositories.** The Worker exposes only comment operations on the configured repository and threads. Visitors see GitHub's consent screen. If this scope is unsuitable, do not deploy this OAuth configuration. A repository-scoped GitHub App is the narrower alternative and needs a different authorization setup.

## Secrets and deployment

Use current Node.js LTS, then run from `comments-worker`:

```sh
npx wrangler@4 login
npx wrangler@4 secret put GITHUB_CLIENT_ID
npx wrangler@4 secret put GITHUB_CLIENT_SECRET
npx wrangler@4 secret put SESSION_SECRET
npx wrangler@4 deploy
```

Wrangler prompts for each value. Generate a unique random session secret with `openssl rand -hex 32` and enter it at the prompt. Local environment and secret files are ignored by Git. Changing the session secret invalidates existing sessions.

The custom-domain route is declared in `wrangler.toml`. Deploy into the Cloudflare account containing the domain. If the canonical site origin changes, update the Worker origins, both articles' `data-api` attributes, and the OAuth callback URL. Do not use wildcard CORS.

Deploy the Worker before publishing the site changes when possible. If unavailable, existing comments can still be read directly from GitHub, but posting and editing are disabled. Utterances login sessions do not transfer. Everyone signs in again through the new app.

## Verify on the live site

1. Signed out, the comment form is visible and posting requires GitHub login.
2. Sign in as `royliu897`. The separate trade-update form appears on the short thesis only. Enter `Bought 10 shares @ $76.43` directly, without a marker.
3. Post a test comment and update. Refresh and verify both persist. Remove test messages through GitHub afterward.
4. Edit a message with its Edit button. The original timestamp remains, alongside a separate edit timestamp.
5. Sign in with another account. Only its messages have Edit buttons, and no update form appears.
6. Sign out. Messages remain readable and write controls are disabled.
7. Check both article versions and a mobile viewport.

After the replacement works, you may uninstall Utterances without deleting the GitHub issues or comments. GitHub remains the moderation interface for deleting abusive comments and locking threads.

## Security and limits

OAuth uses PKCE and state bound to an encrypted cookie. Access tokens are encrypted in Secure, HttpOnly, host-only cookies, never returned to page JavaScript or placed in local storage. Sessions last at most eight hours or until the GitHub token expires. Reauthenticate after expiration or revocation. Sign-out clears the browser cookie but does not revoke the GitHub app authorization. Revoke the app in GitHub settings if needed.

Mutations require the exact website Origin and JSON content. The Worker revalidates the GitHub identity before every write. Updates require account ID `124701324`, not a matching username. Edits require both ownership and membership in the configured discussion. The client sanitizes rendered Markdown through an element and URL allowlist.

GitHub supplies posting and edit times. They are not proof of trade execution or immutable records. Users can still edit or delete their GitHub comments and the repository owner can change the website.

GitHub and Cloudflare plan limits apply. There are no automatic POST/PATCH retries, avoiding duplicate submissions after ambiguous network failures. Add Cloudflare rate limiting on authentication and mutation endpoints if traffic warrants it. Do not log cookies or OAuth callback query strings. The Worker intentionally emits no request or token logs.

## Tests

From the repository root, with Node.js 22 or newer:

```sh
node tests/comments-worker.mjs
python3 tests/writing.py
node tests/reading-progress.cjs
```

With Python Playwright and Chromium installed, run `python3 tests/comments.py`.

Tests mock GitHub and OAuth. Live consent, deployment, cookies and posting still require verification after setup.

References: [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [GitHub issue comments](https://docs.github.com/en/rest/issues/comments), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
