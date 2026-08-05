const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const webhookSource = fs.readFileSync(path.join(__dirname, '..', 'whatsapp-webhook.js'), 'utf8');
const routeSource = fs.readFileSync(path.join(__dirname, '..', 'anthropicRoutes.js'), 'utf8');

test('Anthropic proxy routes use the Firebase admin/manager middleware', () => {
  assert.match(webhookSource, /createAnthropicRouter/);
  assert.match(routeSource, /createFirebaseAdminRoleMiddleware/);
  assert.match(routeSource, /router\.post\('\/analyze-image', requireAdminRole, limitImage,/);
  assert.match(routeSource, /router\.post\('\/analyze-audio', requireAdminRole, limitAudio,/);
  assert.doesNotMatch(webhookSource, /requireBackendApiKey/);
});
