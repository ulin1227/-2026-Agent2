import assert from "node:assert/strict";
import test from "node:test";

import {
  hashPassword,
  isRole,
  isValidEmployeeId,
  normalizeEmployeeId,
  verifyPassword,
} from "../lib/auth-crypto.ts";

test("normalizes and validates employee IDs", () => {
  assert.equal(normalizeEmployeeId("  a12345 "), "A12345");
  assert.equal(normalizeEmployeeId(null), "");
  assert.equal(isValidEmployeeId("A12345"), true);
  assert.equal(isValidEmployeeId("A 123"), false);
  assert.equal(isValidEmployeeId("AB"), false);
});

test("accepts only FM01 roles", () => {
  assert.equal(isRole("supervisor"), true);
  assert.equal(isRole("admin"), false);
});

test("hashes and verifies passwords without storing plaintext", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^pbkdf2-sha256\.210000\./);
  assert.doesNotMatch(hash, /correct horse/);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
  assert.equal(await verifyPassword("anything", "malformed"), false);
});
