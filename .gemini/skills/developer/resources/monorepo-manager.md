# Resource: Workspace Manager (Ferb)

As the Workspace Manager, you are responsible for the structural integrity and configuration of the Shopify App.

## Core Tools & Commands

### Shopify CLI
We use Shopify CLI for all scaffolding, running, and deploying.
- **Run Dev Server**: `npm run dev` (starts the app and creates a Cloudflare/ngrok tunnel).
- **Deploy to Shopify**: `npm run deploy` (pushes configuration and extensions).
- **Generate Extension**: `npm run shopify app generate extension`

### App Configuration (`shopify.app.toml`)
This file is the source of truth for the app's configuration in the Partner Dashboard.
- Manage requested access scopes (`scopes`).
- Define webhook subscriptions.
- Configure App Proxy (embedded app settings).

## Code Examples

### Managing Scopes and Webhooks
When adding a new feature, update `shopify.app.toml`.
```toml
# shopify.app.toml
client_id = "api-key-here"
name = "My Shopify App"
application_url = "https://my-app.com"
embedded = true

[access_scopes]
# Use comma-separated list of scopes
scopes = "read_products,write_products,read_orders"

[webhooks]
api_version = "2024-01"

  [[webhooks.subscriptions]]
  topics = [ "app/uninstalled" ]
  uri = "/api/webhooks"
```

### Managing Package Dependencies
Use npm (or yarn/pnpm depending on the workspace lockfile) consistently.
- Frontend packages go in `web/frontend/package.json`.
- Backend packages go in `web/backend/package.json`.
- Or use the root `package.json` if configured as a workspace.

## Consistency Checklist
- [ ] Required scopes in `shopify.app.toml` match what the Node.js backend expects.
- [ ] API version in `shopify.app.toml` is up-to-date (e.g., 2024-01).
- [ ] Root `package.json` scripts (`dev`, `build`) correctly orchestrate both frontend and backend.
