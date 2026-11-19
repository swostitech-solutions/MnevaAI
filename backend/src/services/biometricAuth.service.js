import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";
import { userStore } from "../models/userStore.js";
import { getRedisClient } from "../config/redis.js";
import { encryptToken, decryptToken, isEncryptedToken } from "./tokenCrypto.js";
import { logger } from "../config/logger.js";

// S-02: `initiate_payment` approvals >= ₹1000 used to trust a plain
// client-supplied `biometricConfirmed: true` boolean with nothing behind
// it — a modified client (or a direct API call with a stolen/valid JWT)
// could just set the flag and skip ever touching Face ID/fingerprint.
//
// Real fix without a custom native module: a device-bound secret, created
// once behind expo-secure-store's `requireAuthentication: true` (Keystore/
// Keychain-backed — reading or creating it already requires a real
// biometric/passcode prompt from the OS itself, see
// mneva/src/storage/biometricKey.js), registered with the server once.
// Approving a gated action now means proving possession of that secret —
// a server-issued, single-use challenge, HMAC'd client-side with the
// secret, verified here — instead of just asserting a boolean. The secret
// itself never leaves the device after registration.
//
// This is HMAC (symmetric), not a full WebAuthn/asymmetric scheme — the
// server holding the shared secret means a server-side compromise could
// forge a signature, which a public-key design wouldn't allow. That's a
// real, disclosed tradeoff of staying within Expo-managed RN (no ejecting
// to write a native Keystore-signing module) — it's still a categorical
// improvement over an unverified boolean, since it now actually requires
// having passed the device's own biometric/passcode check at some point
// to have ever obtained the secret.
const CHALLENGE_TTL_SECONDS = 60;
const challengeKey = (userId, nonce) => `biometric_challenge:${userId}:${nonce}`;

// Pulled out from verifyBiometricSignature so the actual crypto comparison
// is unit-testable without mocking Redis/Prisma — see
// tests/biometricAuth.test.js. Must match mneva/src/storage/biometricKey.js's
// CryptoJS.HmacSHA256(challenge, key).toString(CryptoJS.enc.Hex) exactly.
export function signaturesMatch(challenge, deviceKey, signature) {
  if (typeof challenge !== "string" || typeof deviceKey !== "string" || typeof signature !== "string") return false;
  const expected = crypto.createHmac("sha256", deviceKey).update(challenge).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== gotBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, gotBuf);
}

export async function registerBiometricKey(userId, deviceKeyBase64) {
  if (typeof deviceKeyBase64 !== "string" || deviceKeyBase64.length < 32 || deviceKeyBase64.length > 256) {
    throw new Error("Invalid biometric device key");
  }
  const user = await userStore.getById(userId);
  const prefs = user?.preferences || {};
  prefs.security = { ...(prefs.security || {}), biometricKey: encryptToken({ key: deviceKeyBase64 }) };
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } });
  return { success: true };
}

export async function issueBiometricChallenge(userId) {
  const redis = getRedisClient();
  if (!redis) throw new Error("Biometric verification is temporarily unavailable — please try again shortly");
  const nonce = crypto.randomBytes(24).toString("hex");
  await redis.set(challengeKey(userId, nonce), "1", "EX", CHALLENGE_TTL_SECONDS);
  return nonce;
}

// Returns true only if: a challenge was actually issued to this user and
// hasn't been used or expired (consumed atomically here, single-use), a
// device key is registered, and the HMAC matches. Any other case — no
// redis, no challenge, no key, a bad signature — is a plain `false`, never
// an exception that could get mishandled into "allow".
export async function verifyBiometricSignature(userId, challenge, signature) {
  try {
    if (typeof challenge !== "string" || typeof signature !== "string" || !challenge || !signature) return false;
    const redis = getRedisClient();
    if (!redis) return false;
    const consumed = await redis.del(challengeKey(userId, challenge));
    if (!consumed) return false; // never issued, already used, or expired

    const user = await userStore.getById(userId);
    const stored = user?.preferences?.security?.biometricKey;
    if (!isEncryptedToken(stored)) return false;
    const { key: deviceKey } = decryptToken(stored);
    return signaturesMatch(challenge, deviceKey, signature);
  } catch (err) {
    logger.error(`Biometric signature verification error: ${err.message}`);
    return false;
  }
}

export async function hasBiometricKeyRegistered(userId) {
  const user = await userStore.getById(userId);
  return isEncryptedToken(user?.preferences?.security?.biometricKey);
}

// Shared by both of this codebase's >= ₹1000 payment gates (chat's
// /agent/approve and Bills' direct POST /finance/pay) so the real check —
// not just the "is the flag present" shape of it — can't drift between
// the two call sites the way the old inline boolean check risked.
export async function checkPaymentBiometricGate(userId, amount, preferencesBiometricGate, body) {
  if (Number(amount) < 1000) return null;
  if (preferencesBiometricGate === false) return null; // user turned the gate off
  const verified = await verifyBiometricSignature(userId, body?.biometricChallenge, body?.biometricSignature);
  if (verified) return null;
  return { status: 403, body: { error: "biometric_required", message: "Biometric confirmation is required for payments ≥ ₹1,000." } };
}
