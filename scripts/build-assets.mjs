import fs from "node:fs";
fs.mkdirSync("public", { recursive: true });
fs.copyFileSync("contracts/veridict_escrow.py", "public/veridict_escrow.py");
if (fs.existsSync("evidence/onchain.json"))
  fs.copyFileSync("evidence/onchain.json", "public/deployment.json");
