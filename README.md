# Shopify Cart Transform Bundle App (100% Backend-less & Serverless)

This is a modern, **standard, 100% Extension-Only Shopify Application** that implements bundle and volume discounts using Shopify's native, high-performance **Cart Transform API (`linesMerge` operation)**.

## 🚀 Why Backend-less is the Best standard Shopify App Architecture

Traditional bundle apps require you to host, secure, and maintain an external web server and database to store bundle configurations. 

This application adopts Shopify's **modern serverless architecture**:
- **0% Hosting Costs:** The entire application runs directly on Shopify's infrastructure. Shopify hosts your compiled WebAssembly Cart Transform Function on their global CDN and executes it on their edge servers during checkout.
- **0% Database Management:** Bundle definitions are stored natively inside Shopify's secure merchant data layer using **Shop Metafields**.
- **0% Session/OAuth Overhead:** Because there is no external server, you do not need to manage access tokens, cookie policies, or OAuth handshakes.

---

## 🛠️ How it Works

1. **Merchant View (Shopify Admin):**
   The Merchant defines and maps their product bundles directly inside the native Shopify Admin under **Settings > Custom Data > Shop**. Shopify provides a gorgeous, built-in custom JSON editor to manage this.
2. **Checkout View (Shopify Edge):**
   When a customer adds products to their cart, Shopify executes your compiled **Cart Transform Function** (`cart-transform` WebAssembly extension). The function reads the Shop's active bundle metafield, matches the items in the cart, and merges them into a single Parent SKU at checkout.
3. **Inventory Decoupling:**
   Shopify automatically decrements inventory for the **individual child components** upon purchase, keeping fulfillment and third-party logistics (3PL) perfectly synchronized.

---

## 💻 How to Build and Deploy (On Your Local Machine)

Because compiling JavaScript/TypeScript functions into WebAssembly requires downloading the compilation toolchain (Javy) from GitHub, you should run the build and deploy steps from your **personal computer / local machine** where your network connection is unrestricted.

### 1. Install Dependencies
In the root directory of your project, run:
```bash
npm install
```

### 2. Compile the App & Extensions
To compile your Cart Transform TypeScript logic into the WebAssembly (`dist/function.wasm`) binary:
```bash
npx shopify app build
```

### 3. Deploy to Shopify
To upload your configuration and compiled WebAssembly function directly to your Shopify Partner account:
```bash
npx shopify app deploy
```
*When prompted, confirm that you want to deploy the app. This registers the Cart Transform extension on Shopify's servers globally.*

---

## 📦 How to Test & Configure Bundles (Merchant Setup Guide)

Since this app is backend-less, configuring your bundles is simple and handled natively inside your Shopify Store Admin:

### Step 1: Create the Shop Metafield Definition
Tell Shopify where your app's bundle definitions are stored:
1. Go to your **Shopify Store Admin > Settings > Custom Data**.
2. Click on **Shop** under *Metafields*, then click **Add definition**.
3. Configure the following fields:
   - **Name:** `Active Bundles`
   - **Namespace and key:** `bundle_app.active_bundles`
   - **Type:** Select **JSON**
4. Click **Save**.

### Step 2: Create a Bundle Parent Product
Create the "Shell Product" that will represent the bundle in the cart:
1. Go to **Products > Add Product**.
2. Name it (e.g. `Summer Essentials 3-Pack`).
3. Set your custom bundle Price (e.g. `$29.99`).
4. **Important (Candace's Audit):** Under the *Inventory* section, **disable inventory tracking** (set to "Do not track" or "Track quantity: false"). Shopify will automatically decrement inventory for the underlying components instead of this shell parent.
5. Save the product, and **copy the Variant GraphQL ID** (or numeric ID) of this product (e.g. `gid://shopify/ProductVariant/888888`).

### Step 3: Input Your Bundle Mapping JSON
1. Go to **Settings > Store details**.
2. Scroll to the bottom to find the **Metafields** section.
3. Click on your newly created **Active Bundles** metafield.
4. Input your bundle mapping JSON in the native Shopify editor:
   ```json
   [
     {
       "id": "bundle_summer_999",
       "parentVariantId": "gid://shopify/ProductVariant/888888",
       "components": [
         {
           "variantId": "gid://shopify/ProductVariant/ComponentShirt",
           "quantity": 2
         },
         {
           "variantId": "gid://shopify/ProductVariant/ComponentShorts",
           "quantity": 1
         }
       ]
     }
   ]
   ```
   *(Replace `888888`, `ComponentShirt`, and `ComponentShorts` with the actual Variant GraphQL IDs from your store).*
5. Click **Save**.

### Step 4: Test Storefront Checkout
1. Go to your Online Store storefront.
2. Add **2x Shirts** and **1x Shorts** to the cart.
3. View the Cart / Checkout page. The Cart Transform function automatically triggers, reads your Shop Metafield, and **merges them into the single `Summer Essentials 3-Pack` parent SKU for $29.99!**

---

## 🧪 Running Unit Tests Locally
To verify the math scaling, leftover calculations, and line grouping logic inside the Cart Transform TypeScript code without needing any network or compile connections:
```bash
npm test
```
All **10 tests** covering the Cart Transform function will run and pass green!
