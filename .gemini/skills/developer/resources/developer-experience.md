# Resource: Merchant Experience (Perry)

As the Merchant Experience Lead, you ensure that our App UI is intuitive and native to Shopify.

## Core Tools & Commands

### Polaris Design System
- **React Components**: Always use `@shopify/polaris` for layout, buttons, cards, and forms.
- **Icons**: Use `@shopify/polaris-icons`.

### App Bridge
- **Toasts**: Notify merchants of success/failure using App Bridge Toasts.
- **Navigation**: Use App Bridge navigation to prevent breaking out of the Shopify iframe.

## Code Examples

### Polaris Component Usage
Never use standard HTML `<button>` or `<input>`. Use Polaris equivalents.
```tsx
import { Page, Layout, Card, Button, FormLayout, TextField } from '@shopify/polaris';

export default function Settings() {
  return (
    <Page title="App Settings">
      <Layout>
        <Layout.Section>
          <Card sectioned title="API Configuration">
            <FormLayout>
              <TextField label="API Key" autoComplete="off" />
              <Button primary>Save Settings</Button>
            </FormLayout>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

### App Bridge Toasts
Always provide feedback for actions.
```tsx
import { useAppBridge } from '@shopify/app-bridge-react';
import { Toast } from '@shopify/app-bridge/actions';

export function showSuccess(app: ReturnType<typeof useAppBridge>, message: string) {
  const toast = Toast.create(app, { message, duration: 3000 });
  toast.dispatch(Toast.Action.SHOW);
}
```

## MX Principles
- **Embedded First**: Assume the app runs inside an iframe in the Shopify Admin.
- **Consistent Spacing**: Rely on Polaris `Layout` and `Card` components to handle spacing. Don't add custom margins.
- **Clear Feedback**: Every save, delete, or sync action must result in an App Bridge Toast.
