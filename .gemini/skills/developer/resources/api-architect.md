# Resource: App Architect (Phineas)

As the App Architect, you own the implementation lifecycle of all Shopify application features.

## Core Tools & Commands

### App Management
- **Run Dev Server**: `npm run dev` (starts Shopify CLI and tunnels)
- **Generate Extensions**: `npm run shopify app generate extension`
- **Build App**: `npm run build`

### Shopify API Tools
- **Admin GraphQL API**: Always prefer GraphQL over REST for querying Merchant data.
- **App Bridge**: Use for all frontend navigation and Toast notifications.
- **Polaris**: The strict design system for the React frontend.

## Code Examples

### 1. Frontend: React + Polaris + App Bridge (`web/frontend/`)
Build Merchant-facing UIs using Polaris components.
```tsx
import { Page, Layout, Card, Text } from '@shopify/polaris';
import { useAuthenticatedFetch } from './hooks';

export default function Dashboard() {
  const fetch = useAuthenticatedFetch();

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Text variant="headingMd" as="h2">Merchant Data</Text>
            <p>Welcome to your app dashboard.</p>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### 2. Backend: Node.js + Express (`web/backend/`)
Handle GraphQL requests and authenticated sessions.
```javascript
import shopify from './shopify.js';

export default function applyApiEndpoints(app) {
  app.get('/api/products/count', async (req, res) => {
    const session = res.locals.shopify.session;
    const client = new shopify.api.clients.Graphql({ session });
    const data = await client.query({
      data: `{ products { pageInfo { hasNextPage } } }`,
    });
    res.status(200).send(data.body);
  });
}
```

### 3. Webhooks (`web/backend/webhooks.js`)
Handle Shopify webhooks safely.
```javascript
import shopify from './shopify.js';

export const setupWebhooks = async () => {
  shopify.api.webhooks.addHandlers({
    APP_UNINSTALLED: {
      deliveryMethod: shopify.api.deliveryMethods.Http,
      callbackUrl: '/api/webhooks',
      callback: async (topic, shop, body, webhookId) => {
        console.log('App uninstalled by:', shop);
        // Clean up merchant data
      },
    },
  });
};
```

## Mandates & Laws
- **Shopify CLI**: Use CLI for all scaffolding.
- **Polaris Only**: Do not use custom CSS frameworks like Tailwind unless heavily justified; use Polaris.
- **Session Tokens**: All backend API routes MUST verify Shopify App Bridge session tokens.
