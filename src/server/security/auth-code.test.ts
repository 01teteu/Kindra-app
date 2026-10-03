import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { hashAuthCode, resolveAuthCodeHmacKey, verifyAuthCodeDigest } from './auth-code.js';

test('production requires a strong independent Base64 secret', () => {
  assert.throws(() => resolveAuthCodeHmacKey(undefined, 'production'), /obrigatório/);
  assert.throws(() => resolveAuthCodeHmacKey('change_me', 'production'), /inválido/);
  assert.throws(() => resolveAuthCodeHmacKey(Buffer.alloc(16, 1).toString('base64'), 'production'), /32 bytes/);
  assert.throws(() => resolveAuthCodeHmacKey('not valid base64!', 'production'), /Base64/);
  const configured = Buffer.alloc(32, 7);
  assert.deepEqual(resolveAuthCodeHmacKey(configured.toString('base64'), 'production'), configured);
});

test('development can use one ephemeral process key when configuration is absent', () => {
  const ephemeral = Buffer.alloc(32, 9);
  assert.deepEqual(resolveAuthCodeHmacKey(undefined, 'development', () => ephemeral), ephemeral);
});

test('HMAC digests are purpose-separated and verified in constant-time compatible form', () => {
  const code = '123456';
  const emailDigest = hashAuthCode('email-verification', code);
  const resetDigest = hashAuthCode('password-reset', code);
  assert.match(emailDigest, /^[a-f0-9]{64}$/);
  assert.notEqual(emailDigest, createHash('sha256').update(code).digest('hex'));
  assert.notEqual(emailDigest, resetDigest);
  assert.equal(verifyAuthCodeDigest(emailDigest, 'email-verification', code), true);
  assert.equal(verifyAuthCodeDigest(emailDigest, 'email-verification', '654321'), false);
  assert.equal(verifyAuthCodeDigest(emailDigest, 'password-reset', code), false);
  for (const invalid of ['', 'xyz', 'a'.repeat(63), 'a'.repeat(65)]) {
    assert.equal(verifyAuthCodeDigest(invalid, 'email-verification', code), false);
  }
});
