import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const password = process.argv[2] || readFileSync(0, "utf8").trim();

if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const iterations = 310000;
const salt = crypto.randomBytes(16).toString("base64url");
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");

console.log(`pbkdf2_sha256$${iterations}$${salt}$${hash}`);
