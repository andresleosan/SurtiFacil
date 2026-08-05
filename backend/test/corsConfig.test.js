const assert = require('node:assert/strict');
const test = require('node:test');

const { parseFrontendOrigins } = require('../corsConfig');

test('uses safe development origins when FRONTEND_ORIGINS is not configured', () => {
  assert.deepEqual(parseFrontendOrigins(), [
    'http://localhost:5173',
    'https://smartmarket-b37ce.web.app',
  ]);
});

test('parses comma-separated origins by trimming and filtering empty values', () => {
  assert.deepEqual(parseFrontendOrigins(' https://admin.example.com, ,http://localhost:4173 '), [
    'https://admin.example.com',
    'http://localhost:4173',
  ]);
});

test('ignores wildcard origins and falls back safely when none remain', () => {
  assert.deepEqual(parseFrontendOrigins('https://admin.example.com, *'), [
    'https://admin.example.com',
  ]);
  assert.deepEqual(parseFrontendOrigins('*'), [
    'http://localhost:5173',
    'https://smartmarket-b37ce.web.app',
  ]);
});
