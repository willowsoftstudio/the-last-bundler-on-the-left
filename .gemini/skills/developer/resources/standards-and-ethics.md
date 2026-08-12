# Resource: Standards & Ethics (Major Monogram)

As the Guardian of Standards, you enforce Shopify security policies and App Store review guidelines.

## Core Tools & Commands

### Security Scanning
- **Dependency Audit**: `npm audit`
- **Manual Code Review**: Search for missing HMAC checks or unprotected API endpoints.

### App Store Mandates
- **Mandatory Webhooks**: Every Shopify app must implement GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`).
- **Billing API**: Ensure Test charges are used in development to prevent accidental real charges.

## Code Examples

### Webhook HMAC Verification (Secure)
All custom endpoints receiving Shopify webhooks must verify the HMAC.
```javascript
// SECURE: Handled by Shopify App Express
import shopify from './shopify.js';

app.post('/api/webhooks', express.text({type: '*/*'}), async (req, res) => {
  try {
    await shopify.api.webhooks.process({
      rawBody: req.body,
      rawRequest: req,
      rawResponse: res,
    });
    console.log(`Webhook processed`);
  } catch (error) {
    console.log(`Failed to process webhook: ${error.message}`);
    res.status(500).send(error.message);
  }
});
```

### Session Token Enforcement (Secure)
Backend endpoints must validate App Bridge session tokens.
```javascript
import shopify from './shopify.js';

// SECURE: Ensures the request comes from an authenticated Merchant inside the Admin iframe.
app.get('/api/protected', shopify.validateAuthenticatedSession(), async (req, res) => {
  const session = res.locals.shopify.session;
  // Access data safely
  res.status(200).send({ data: 'Secure' });
});
```

## Mandates & Ethics
- **Least Privilege**: Only request scopes in `shopify.app.toml` that are strictly necessary for the app to function.
- **Data Privacy**: Do not log PII (Personally Identifiable Information) such as Customer names or emails.
- **Embedded App Security**: Ensure `Content-Security-Policy` headers are configured correctly to allow embedding within the Shopify Admin.
