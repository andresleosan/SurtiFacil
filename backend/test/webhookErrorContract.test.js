const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const webhookSource = fs.readFileSync(
  path.join(__dirname, '..', 'whatsapp-webhook.js'),
  'utf8',
);

test('webhook error paths use generic responses instead of provider error details', () => {
  assert.match(webhookSource, /function sendApiError\(res, status, code = 'internal'\)/);
  assert.doesNotMatch(webhookSource, /res\.status\([^)]*\)\.json\(\{\s*error:\s*error\.message/);
  assert.doesNotMatch(webhookSource, /console\.(error|warn)\([^\n]*error(?:\.|\s*[,\)])/);
});
