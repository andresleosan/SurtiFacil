const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');

test('backend container pins Node, installs production dependencies, and runs unprivileged', () => {
  assert.match(dockerfile, /^FROM node:22\.23\.2-bookworm-slim@sha256:[a-f0-9]{64}$/m);
  assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
  assert.match(dockerfile, /^ENV NODE_ENV=production \\/m);
  assert.match(dockerfile, /^\s+PORT=8080$/m);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^HEALTHCHECK /m);
  assert.match(dockerfile, /^CMD \["node", "whatsapp-webhook\.js"\]$/m);
});

test('backend container context excludes credentials, source history, tests, and frontend assets', () => {
  assert.match(dockerignore, /^\*\*$/m);
  assert.match(dockerignore, /^!backend\/\*\.js$/m);
  assert.match(dockerignore, /^!backend\/package\.json$/m);
  assert.match(dockerignore, /^!backend\/package-lock\.json$/m);
  assert.doesNotMatch(dockerfile, /serviceAccountKey|credentials/i);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s+/i);
  assert.doesNotMatch(dockerfile, /(?:COPY|ADD)\s+[^\n]*(?:\.env|\.git|test\/)/i);
});
