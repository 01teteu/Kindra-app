import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveJwtSecret } from './jwt-secret.js';

test('production requires a strong Base64 JWT secret', () => {
  assert.throws(() => resolveJwtSecret(undefined, 'production'), /obrigatório/);
  assert.throws(() => resolveJwtSecret('change_me', 'production'), /inválido/);
  assert.throws(() => resolveJwtSecret('not valid base64!', 'production'), /Base64 válido/);
  assert.throws(() => resolveJwtSecret(Buffer.alloc(16, 1).toString('base64'), 'production'), /32 bytes/);

  const configured = Buffer.alloc(32, 7).toString('base64');
  assert.equal(resolveJwtSecret(configured, 'production'), configured);
});

test('development uses one ephemeral process secret when configuration is absent', () => {
  assert.equal(resolveJwtSecret(undefined, 'development', () => 'ephemeral-process-secret'), 'ephemeral-process-secret');
  assert.equal(resolveJwtSecret('local-configured-secret', 'test'), 'local-configured-secret');
});
