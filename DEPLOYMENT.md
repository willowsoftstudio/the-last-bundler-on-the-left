# App Deployment Guide — Shopify Cart Transform Bundle App

This document details the step-by-step procedures to deploy your isolated app repository to **GitHub**, **Shopify**, and **Vercel** (Preview and Production) from within the Monorepo Shell workshop environment.

---

## 1. Deploying to GitHub (Separate Repo)

Because this app lives in a gitignored `apps/the-last-bundler` directory inside the Monorepo Shell, it operates as an **independent Git repository**. This allows you to push it to a dedicated GitHub repository under a separate GitHub account.

### Step 1: Initialize Git in your App Directory
If you haven't already, initialize git inside this directory:
```bash
cd apps/the-last-bundler
git init
git checkout -b main
```

### Step 2: Add your GitHub Remote GID
Connect this local directory to your dedicated GitHub repository (hosted on your desired GitHub account):
```bash
# SSH (Recommended for multiple accounts)
git remote add origin git@github.com:your-app-account/the-last-bundler-app.git

# HTTPS
# git remote add origin https://github.com/your-app-account/the-last-bundler-app.git
```

### Step 3: Commit and Push
```bash
git add .
git commit -m "feat: migrate to pnpm workspace app"
git push -u origin main
```

---

## 2. Deploying to Vercel (Hosting & DB)

Vercel seamlessly hosts the Express Node.js backend. Because the app is nested inside a pnpm monorepo, you must configure Vercel's Monorepo features on the Vercel Dashboard.

### Step 1: Import Project on Vercel
1. Log into your Vercel Account.
2. Click **Add New** ➔ **Project**.
3. Select your GitHub repository: `the-last-bundler-app`.

### Step 2: Configure Workspace Settings (Crucial!)
During import, expand the **Build & Development Settings** and configure:
- **Framework Preset:** `Other` (or `None`)
- **Root Directory:** Toggle "Override" and enter: **`apps/the-last-bundler`**
- **Include files outside the Root Directory in the Build Step:** Ensure this is **`Checked`** (Enabled). This allows Vercel to look up the root `pnpm-workspace.yaml` and resolve any local shared packages like `@mono/ts-config`!

### Step 3: Add Environment Variables
Add your secrets inside Vercel's **Environment Variables** panel:
*   `DATABASE_URL`: Your remote Postgres connection string (e.g., from Prisma DB/Accelerate or Neon).
*   `SHOPIFY_API_KEY`: Your Shopify App API key.
*   `SHOPIFY_API_SECRET`: Your Shopify App client secret.
*   `SHOPIFY_CART_TRANSFORM_ID`: Your registered Cart Transform GID.
*   `SCOPES`: `write_products,write_cart_transforms,write_orders`

### Step 4: Preview & Production Deployments
*   **Preview Deployments:** Whenever you push a commit to any branch other than `main` (e.g., `develop` or `feature/deals`), Vercel automatically generates a **Preview URL** (e.g., `https://my-app-git-develop.vercel.app`).
*   **Production Deployment:** Pushing or merging a pull request into `main` automatically triggers a **Production Deployment** on your primary domain.

---

## 3. Deploying to Shopify (Function Extension)

To push your compiled WebAssembly (WASM) function extension live to Shopify's edge servers, use the Shopify CLI.

### Step 1: Authenticate with Shopify
Ensure you are logged into your correct Shopify Partner account:
```bash
cd apps/the-last-bundler
npx shopify auth login
```

### Step 2: Compile the WASM Function
Run the build script to compile the latest quantity caps and limitations logic:
```bash
npm run build
```

### Step 3: Deploy to Shopify Partners
Deploy your App configuration and the compiled WASM extension live to Shopify:
```bash
npx shopify app deploy
```
*Follow the terminal prompts to select your existing app registration in your Shopify Partners dashboard. This will upload the `.wasm` file and update your app's extensions.*

---

## 4. Local Development Hook (Running the Whole Stack)
To run your local server with automatic tunneling (using Cloudflare/Ngrok built-in to Shopify CLI):
```bash
cd apps/the-last-bundler
npx shopify app dev
```
This automatically updates your App URL in Vercel/Shopify Partners and sets up the live tunnels for E2E storefront checkouts!
