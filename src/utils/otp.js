import crypto from "crypto";

export function generate6DigitCode() {
  // 000000..999999 (безопаснее: crypto.randomInt)
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function hashCode(code) {
  // простой SHA256 достаточно для учебного проекта
  return crypto.createHash("sha256").update(code).digest("hex");
}