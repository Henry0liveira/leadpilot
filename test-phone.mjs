import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneBR, formatPhoneDisplay } from './phone.mjs';

test('adiciona 55 a telefones locais com DDD e identifica celular', () => {
  const r = normalizePhoneBR('(12) 99999-1111');
  assert.equal(r.digits, '5512999991111');
  assert.equal(r.celular, true);
  assert.equal(r.whatsappProvavel, true);
});

test('aceita número já com código do país e marca fixo como WhatsApp improvável', () => {
  const r = normalizePhoneBR('+55 12 3642-1234');
  assert.equal(r.digits, '551236421234');
  assert.equal(r.celular, false);
});

test('rejeita valores inválidos', () => {
  assert.equal(normalizePhoneBR(''), null);
  assert.equal(normalizePhoneBR(undefined), null);
  assert.equal(normalizePhoneBR('1199999'), null);
  assert.equal(normalizePhoneBR('(01) 99999-1111'), null);
  assert.equal(normalizePhoneBR('123456789012345'), null);
});

test('formata para exibição', () => {
  assert.equal(formatPhoneDisplay('5512999991111'), '+55 (12) 99999-1111');
  assert.equal(formatPhoneDisplay(''), '');
});
