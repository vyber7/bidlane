import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(join(root, "node_modules/.bidlane-contract-"));
try {
  execFileSync(process.execPath, [join(root, "node_modules/prisma-v8/dist/prisma.js"), "contract", "emit", "--config", join(root, "prisma8.config.ts"), "--output-path", output], { cwd: root, stdio: "pipe", timeout: 30_000 });
  for (const name of ["contract.json", "contract.d.ts"]) {
    if (readFileSync(join(output, name), "utf8") !== readFileSync(join(root, "prisma/v8", name), "utf8")) throw new Error("Artifact drift");
  }
  console.log("Prisma 8 contract and generated types are valid and in sync.");
} catch {
  console.error("Contract validation failed. Check prisma/v8/contract.ts and run npm run db:generate to refresh its artifacts.");
  process.exitCode = 1;
} finally { rmSync(output, { recursive: true, force: true }); }
