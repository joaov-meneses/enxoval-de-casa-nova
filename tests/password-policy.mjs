import assert from "node:assert/strict";
import test from "node:test";
import { hasDigitSequence, passwordPolicyError, unmetPasswordRules } from "../shared/passwordPolicy.ts";

test("aceita senha com letra, número e caractere especial, sem sequência", () => {
  for (const ok of ["Casa#Mia7", "minha-casa-2580", "Lar@nov0", "ação!9xyz", "Casa#2024"]) assert.equal(passwordPolicyError(ok), null, ok);
});

test("aponta cada requisito que falta", () => {
  assert.deepEqual(unmetPasswordRules("Ab#4"), ["length"]);
  assert.deepEqual(unmetPasswordRules("12345678#"), ["letter", "sequence"]);
  assert.deepEqual(unmetPasswordRules("senha-segura"), ["number"]);
  assert.deepEqual(unmetPasswordRules("senha2580"), ["special"]);
  assert.deepEqual(unmetPasswordRules("casa  mia 7"), ["special"], "espaço não conta como caractere especial");
  assert.deepEqual(unmetPasswordRules(""), ["length", "letter", "number", "special"]);
});

test("recusa três ou mais números seguidos, subindo ou descendo", () => {
  for (const seq of ["123", "x012y", "987", "Casa#4567", "a3210"]) assert.equal(hasDigitSequence(seq), true, seq);
  for (const free of ["12", "135", "1#23", "2580", "112", "a1b2c3", "890"]) assert.equal(hasDigitSequence(free), false, free);
  assert.match(passwordPolicyError("Casa#123") ?? "", /sequência/);
});

test("limita o tamanho máximo", () => {
  assert.match(passwordPolicyError(`Aa#9${"x".repeat(125)}`) ?? "", /no máximo 128/);
  assert.equal(passwordPolicyError(`Aa#9${"x".repeat(124)}`), null);
});
