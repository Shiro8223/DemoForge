/**
 * Free check that your Higgsfield developer API key works (spends no credits).
 *   npx tsx scripts/check-higgsfield.ts
 */
import "dotenv/config";
import { apiConfigured, checkApiCredentials } from "../src/lib/higgsfield/api";

if (!process.env.HF_CREDENTIALS) {
  console.error("HF_CREDENTIALS is empty in .env (format KEY_ID:KEY_SECRET).");
  process.exit(1);
}
const r = await checkApiCredentials();
console.log(`${r.ok ? "OK" : "FAILED"} (HTTP ${r.status}): ${r.message}`);
if (r.ok && apiConfigured()) console.log(`Model: ${process.env.HIGGSFIELD_MODEL || "kling-video/v3.0/std/text-to-video (default)"}`);
process.exit(r.ok ? 0 : 1);
