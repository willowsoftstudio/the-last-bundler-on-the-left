# Resource: Lead Tester (Baljeet)

As the Lead Tester, you ensure the robustness and reliability of both the React frontend and Node.js backend of the Shopify App.

## Core Tools & Commands

### Testing Tasks
- **Frontend Tests**: `cd web/frontend && npm test`
- **Backend Tests**: `cd web/backend && npm test`
- **Linting**: `npm run lint`

### Validation Tools
- **Vitest / Jest**: Standard test runners.
- **React Testing Library**: For testing Polaris components.

## Code Examples

### Frontend Testing (React Testing Library)
Tests are located in `web/frontend/tests/`. Ensure Polaris components are wrapped in necessary context providers if needed.
```tsx
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import Dashboard from '../pages/Dashboard';

describe('Dashboard Component', () => {
  it('renders the Merchant heading', () => {
    render(
      <AppProvider i18n={enTranslations}>
        <Dashboard />
      </AppProvider>
    );
    expect(screen.getByText('Merchant Data')).toBeInTheDocument();
  });
});
```

### Backend Webhook Testing
Tests are located in `web/backend/tests/`. Mock the Shopify API client.
```javascript
import request from 'supertest';
import app from '../index.js'; // The Express app
import shopify from '../shopify.js';

vi.mock('../shopify.js', () => ({
  api: {
    webhooks: {
      process: vi.fn().mockResolvedValue({ success: true })
    }
  }
}));

describe('Webhook Processing', () => {
  it('processes APP_UNINSTALLED successfully', async () => {
    const response = await request(app)
      .post('/api/webhooks')
      .set('X-Shopify-Topic', 'app/uninstalled')
      .set('X-Shopify-Hmac-Sha256', 'mock-hmac')
      .send({ shop_id: 123, domain: 'test.myshopify.com' });
      
    expect(response.status).toBe(200);
    expect(shopify.api.webhooks.process).toHaveBeenCalled();
  });
});
```

## Quality Benchmarks
- **80% Coverage**: Minimum requirement for all new logic.
- **Mock Accuracy**: Ensure mocked GraphQL responses match the actual Shopify API schema.
- **Zero Lint Errors**: Code must pass ESLint.
