import fs from "node:fs";
import assert from "node:assert/strict";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const proof = JSON.parse(fs.readFileSync("evidence/onchain.json", "utf8"));
const operator = createAccount(
  fs.readFileSync(".local/operator-key", "utf8").trim(),
);
const outsider = createAccount();
const client = createClient({
  chain: studionet,
  endpoint: proof.rpc,
  account: operator,
});
if ((await client.getChainId()) !== 61999) throw Error("Wrong chain");
const address = proof.contractAddress;
const read = () =>
  client.readContract({
    address,
    functionName: "get_agreement",
    args: ["VRD-PARTIAL-01"],
  });
const before = await read();
const checks = [
  [
    "UNAUTHORIZED_ADJUDICATION",
    "adjudicate_claim",
    ["VRD-PARTIAL-01", "Please adjudicate the agreed criteria."],
    outsider,
    "AGREEMENT_PARTIES_ONLY",
  ],
  [
    "UNAUTHORIZED_REVIEW",
    "request_review",
    [
      "VRD-PARTIAL-01",
      "Please review the source and corresponding criterion findings.",
    ],
    outsider,
    "AGREEMENT_PARTIES_ONLY",
  ],
  [
    "FINALIZED_REPLAY",
    "adjudicate_claim",
    ["VRD-PARTIAL-01", "Please adjudicate the agreed criteria."],
    operator,
    "REQUEST_REVIEW_BEFORE_READJUDICATION",
  ],
  [
    "REVIEW_LIMIT",
    "request_review",
    [
      "VRD-PARTIAL-01",
      "Please review the source and corresponding criterion findings.",
    ],
    operator,
    "REVIEW_LIMIT_REACHED",
  ],
  [
    "DUPLICATE_AGREEMENT",
    "create_agreement",
    [
      "VRD-PARTIAL-01",
      operator.address,
      "A replacement agreement must not overwrite the original.",
      "https://example.com/",
      "independent",
      1,
      "[]",
    ],
    operator,
    "AGREEMENT_ALREADY_EXISTS",
  ],
];
const results = [];
for (const [name, method, args, account, expected] of checks) {
  let error = "";
  try {
    await client.simulateWriteContract({
      address,
      functionName: method,
      args,
      account,
    });
  } catch (e) {
    let cause = e;
    for (let i = 0; cause && i < 5; i++, cause = cause.cause) {
      error += "\n" + (cause.shortMessage || cause.message || "");
      error += "\n" + (cause.data?.receipt?.genvm_result?.stderr || "");
    }
  }
  assert.ok(
    error.includes(expected),
    `${name} did not reject with ${expected}: ${error.slice(0, 300)}`,
  );
  results.push({
    name,
    expectedError: expected,
    observedError: expected,
    passed: true,
    executionResult: "ERROR",
  });
  console.log("PASS", name, expected);
}
assert.equal(
  await read(),
  before,
  "Guard checks must not alter contract state",
);
const result = {
  chainId: 61999,
  contractAddress: address,
  method:
    "Remote GenVM write simulation (gen_call), no committed guard-test transactions",
  checks: results,
  stateUnchanged: true,
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync(
  "evidence/guards.json",
  JSON.stringify(result, null, 2) + "\n",
);
