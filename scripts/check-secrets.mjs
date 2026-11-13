import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const names = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean);
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".txt", ".yaml", ".yml", ".toml", ".ps1", ".css", ".html"]);
const rules = [
  ["GitHub classic token", /ghp_[A-Za-z0-9]{20,}/],
  ["GitHub fine-grained token", /github_pat_[A-Za-z0-9_]{20,}/],
  ["Secret API key", /sk-[A-Za-z0-9_-]{20,}/],
  ["Bearer authorization", /authorization\s*["']?\s*:\s*["']?bearer\s+\S+/i],
  ["Credential in URL", /https?:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];
let checked = 0;
let findings = 0;
for (const name of new Set(names)) {
  const file = path.join(root, name);
  const extension = path.extname(name).toLowerCase();
  if (!fs.existsSync(file) || (extension && !extensions.has(extension))) continue;
  checked++;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const [label, pattern] of rules) {
      if (!pattern.test(line)) continue;
      console.error(`${name}:${index + 1}: ${label}`);
      findings++;
    }
  }
}
console.log(`Secret scan: ${checked} text files checked; ${findings} potential findings.`);
process.exitCode = findings ? 1 : 0;
