import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const proof = JSON.parse(fs.readFileSync("evidence/onchain.json", "utf8"));
const client = createClient({
  chain: studionet,
  endpoint: "https://studio.genlayer.com/api",
});
assert.equal(await client.getChainId(), 61999);
const deployed = await client.getContractCode(proof.contractAddress);
const hash = (code) => crypto.createHash("sha256").update(code).digest("hex");
assert.equal(hash(deployed), proof.sourceSha256);
assert.equal(
  hash(fs.readFileSync("contracts/veridict_escrow.py", "utf8")),
  proof.sourceSha256,
);
for (const test of proof.cases) {
  const state = JSON.parse(
    await client.readContract({
      address: proof.contractAddress,
      functionName: "get_agreement",
      args: [test.id],
    }),
  );
  assert.equal(state.verdict, test.expectedVerdict);
  assert.equal(state.payout_ratio_bps, test.expectedRatioBps);
  assert.equal(hash(state.evidence_snapshot), state.evidence_sha256);
  console.log("PASS", test.id, state.verdict, state.payout_ratio_bps);
}
const review = JSON.parse(
  await client.readContract({
    address: proof.contractAddress,
    functionName: "get_agreement",
    args: ["VRD-PARTIAL-01"],
  }),
);
assert.equal(review.revision, 2);
assert.equal(review.history.length, 2);
const receipts = [];
const browserFile = "evidence/browser-flow.json";
if (fs.existsSync(browserFile)) {
  const browser = JSON.parse(fs.readFileSync(browserFile, "utf8"));
  const live = JSON.parse(
    await client.readContract({
      address: proof.contractAddress,
      functionName: "get_agreement",
      args: [browser.record.id],
    }),
  );
  assert.equal(live.verdict, browser.record.verdict);
  assert.equal(live.evidence_sha256, browser.record.evidence_sha256);
  for (const tx of browser.transactions)
    proof.transactions["browser-" + tx.action] = tx.hash;
}

for (const [name, hash] of Object.entries(proof.transactions)) {
  const raw = await client.request({
    method: "eth_getTransactionByHash",
    params: [hash],
  });
  assert.ok(
    ["ACCEPTED", "FINALIZED"].includes(raw.status),
    `${name}: ${raw.status}`,
  );
  assert.ok(
    raw.consensus_data.leader_receipt.every(
      (r) => r.execution_result === "SUCCESS",
    ),
    `${name}: execution failed`,
  );
  receipts.push({ name, hash, status: raw.status });
}
fs.writeFileSync(
  "evidence/live-verification.json",
  JSON.stringify(
    {
      chainId: 61999,
      contractAddress: proof.contractAddress,
      sourceVerified: true,
      evidenceHashesVerified: true,
      reviewHistoryVerified: true,
      receipts,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Verified deployed source, evidence commitments, decisions, review history and all transaction executions.",
);
