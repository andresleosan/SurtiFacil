const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSafeApiError,
  getSafeApiLogMessage,
} = require('../apiErrorContract');

test('returns fixed generic API errors without provider details', () => {
  const response = getSafeApiError('internal', new Error('provider token=secret phone=5551234567'));

  assert.deepEqual(response, { error: 'Error interno del servidor' });
  assert.doesNotMatch(JSON.stringify(response), /provider|secret|5551234567/);
});

test('creates static non-sensitive log messages', () => {
  const logMessage = getSafeApiLogMessage('Anthropic image analysis', new Error('provider payload secret'));

  assert.equal(logMessage, '[api] Anthropic image analysis failed');
  assert.doesNotMatch(logMessage, /provider|payload|secret/);
});
