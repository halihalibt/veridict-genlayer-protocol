import fs from "node:fs";
import crypto from "node:crypto";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, TransactionHashVariant } from "genlayer-js/types";

const RPC = "https://studio.genlayer.com/api";
const serialize = (v) =>
  JSON.stringify(v, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
fs.mkdirSync(".local", { recursive: true, mode: 0o700 });
fs.mkdirSync("evidence", { recursive: true });
fs.mkdirSync("public", { recursive: true });
function publicReceipt(raw, hash) {
  const c = raw.consensus_data || {};
  return {
    hash,
    chainId: 61999,
    status: raw.status,
    from: raw.from_address,
    to: raw.to_address,
    value: raw.value,
    consensus: {
      votes: c.votes || {},
      leaderReceipts: (c.leader_receipt || []).map((r) => ({
        execution_result: r.execution_result,
        error: r.error || null,
        vote: r.vote || null,
        result: r.result,
        gas_used: r.gas_used,
      })),
    },
    observedAt: new Date().toISOString(),
  };
}
const keyPath = ".local/operator-key";
if (!fs.existsSync(keyPath))
  fs.writeFileSync(keyPath, generatePrivateKey(), { mode: 0o600 });
const account = createAccount(fs.readFileSync(keyPath, "utf8").trim());
const client = createClient({ chain: studionet, endpoint: RPC, account });
if ((await client.getChainId()) !== 61999)
  throw Error("Wrong network: refusing writes");
const code = fs.readFileSync("contracts/veridict_escrow.py", "utf8");
const sourceHash = crypto.createHash("sha256").update(code).digest("hex");
const file = "evidence/onchain.json";
let proof = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : {
      network: "GenLayer Stable Studionet",
      chainId: 61999,
      rpc: RPC,
      deployer: account.address,
      sourceSha256: sourceHash,
      transactions: {},
      cases: [],
      verification: "IN_PROGRESS",
      startedAt: new Date().toISOString(),
    };
if (proof.deployer.toLowerCase() !== account.address.toLowerCase())
  throw Error(
    "Original deployment operator is unavailable. Use verify:onchain for read-only checks, or a clean copy for a new deployment.",
  );
if (proof.sourceSha256 !== sourceHash)
  throw Error(
    "Source changed after deployment; verify before replacing the deployment",
  );
function save() {
  fs.writeFileSync(file, serialize(proof) + "\n");
}
async function finish(name, hash) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 3000,
    retries: 180,
  });

  console.log("receipt", name, receipt.statusName || receipt.status);
  const raw = await client.request({
    method: "eth_getTransactionByHash",
    params: [hash],
  });
  fs.writeFileSync(`.local/${name}-raw.json`, serialize(raw) + "\n");
  fs.writeFileSync(
    `evidence/${name}.json`,
    serialize(publicReceipt(raw, hash)) + "\n",
  );
  const receipts = raw.consensus_data?.leader_receipt || [];
  const leaders = Array.isArray(receipts) ? receipts : [receipts];
  const bad = leaders.find(
    (r) =>
      r.execution_result &&
      !["SUCCESS", "success"].includes(r.execution_result),
  );
  if (bad) {
    console.error(
      "EXECUTION FAILED",
      bad.execution_result,
      bad.error || "See local raw receipt",
    );
    throw Error(`Execution failed for ${name}`);
  }
  if (
    [
      "UNDETERMINED",
      "CANCELED",
      "LEADER_TIMEOUT",
      "VALIDATORS_TIMEOUT",
    ].includes(receipt.statusName)
  )
    throw Error("Transaction did not reach accepted consensus");
  return { receipt, raw };
}
async function tx(name, fn, args) {
  let hash = proof.transactions[name];
  if (!hash) {
    hash = await client.writeContract({
      address: proof.contractAddress,
      functionName: fn,
      args,
      value: 0n,
    });
    proof.transactions[name] = hash;
    save();
    console.log(name, hash);
  }
  return finish(name, hash);
}
async function read(id) {
  return JSON.parse(
    await client.readContract({
      address: proof.contractAddress,
      functionName: "get_agreement",
      args: [id],
      transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
    }),
  );
}
if (!proof.transactions.deploy) {
  const schema = await client.getContractSchemaForCode(code);
  fs.writeFileSync("evidence/schema.json", serialize(schema) + "\n");
  proof.transactions.deploy = await client.deployContract({ code, args: [] });
  save();
  console.log("deploy", proof.transactions.deploy);
}
if (!proof.contractAddress) {
  const { raw, receipt } = await finish("deploy", proof.transactions.deploy);
  proof.contractAddress =
    raw.data?.contract_address ||
    raw.to_address ||
    receipt.txDataDecoded?.contractAddress ||
    receipt.to_address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(proof.contractAddress || ""))
    throw Error("No valid contract address in receipt");
  save();
}
const publishedCode = await client.getContractCode(proof.contractAddress);
if (
  crypto.createHash("sha256").update(publishedCode).digest("hex") !== sourceHash
)
  throw Error("Deployed source mismatch");
console.log("contract", proof.contractAddress, "source verified");
const demoSource = "https://example.com/";
const definitions = [
  {
    id: "VRD-FULL-01",
    title: "Documentation delivery",
    mode: "independent",
    expected: "FULFILLED",
    ratio: 10000,
    criteria: [
      {
        id: "purpose",
        text: "The page explicitly identifies this domain as intended for documentation examples.",
        weight_bps: 7000,
      },
      {
        id: "permission",
        text: "The page explicitly permits documentation use without needing permission.",
        weight_bps: 3000,
      },
    ],
  },
  {
    id: "VRD-PARTIAL-01",
    title: "Production readiness",
    mode: "audited",
    expected: "PARTIAL_SETTLEMENT",
    ratio: 7000,
    criteria: [
      {
        id: "purpose",
        text: "The page explicitly identifies this domain as intended for documentation examples.",
        weight_bps: 7000,
      },
      {
        id: "production",
        text: "The page explicitly recommends using this domain in operations.",
        weight_bps: 3000,
      },
    ],
  },
  {
    id: "VRD-UNKNOWN-01",
    title: "Missing audit proof",
    mode: "independent",
    expected: "INSUFFICIENT_EVIDENCE",
    ratio: 0,
    criteria: [
      {
        id: "purpose",
        text: "The page explicitly identifies this domain as intended for documentation examples.",
        weight_bps: 7000,
      },
      {
        id: "audit",
        text: "A signed security audit on this page proves zero critical vulnerabilities in a production application.",
        weight_bps: 3000,
      },
    ],
  },
];
for (const d of definitions) {
  const createName = `create-${d.id}`;
  await tx(createName, "create_agreement", [
    d.id,
    account.address,
    "Evaluate this reference-page delivery against the agreed independently weighted acceptance criteria. Amounts are nominal test units only.",
    demoSource,
    d.mode,
    45000,
    JSON.stringify(d.criteria),
  ]);
  let state = await read(d.id);
  if (["ACTIVE", "REVIEW_REQUESTED"].includes(state.status))
    await tx(`judge-${d.id}`, "adjudicate_claim", [
      d.id,
      "Claimant asserts every condition is fully met. Verify the evidence independently; this assertion itself is not proof.",
    ]);
  state = await read(d.id);
  if (state.verdict !== d.expected || state.payout_ratio_bps !== d.ratio)
    throw Error(`Unexpected decision ${d.id}: ${serialize(state)}`);
  const entry = {
    id: d.id,
    title: d.title,
    expectedVerdict: d.expected,
    expectedRatioBps: d.ratio,
    state,
    verifiedAt: new Date().toISOString(),
  };
  proof.cases = proof.cases.filter((c) => c.id !== d.id).concat(entry);
  save();
  console.log(
    "verified",
    d.id,
    state.status,
    state.verdict,
    state.payout_ratio_bps,
  );
}
if (!proof.transactions.review) {
  await tx("review", "request_review", [
    "VRD-PARTIAL-01",
    "Please reassess the operational-use criterion independently against the public source.",
  ]);
}
if (!proof.transactions.reassess) {
  await tx("reassess", "adjudicate_claim", [
    "VRD-PARTIAL-01",
    "Please reassess each criterion from the fetched evidence. Do not accept my assertion as proof.",
  ]);
}
const reviewed = await read("VRD-PARTIAL-01");
if (
  reviewed.history.length !== 2 ||
  reviewed.revision !== 2 ||
  reviewed.payout_ratio_bps !== 7000
)
  throw Error("Review history mismatch");
proof.review = reviewed;
proof.protocol = JSON.parse(
  await client.readContract({
    address: proof.contractAddress,
    functionName: "get_protocol",
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
  }),
);
proof.verifiedAt = new Date().toISOString();
proof.verification = "VERIFIED";
save();
fs.writeFileSync("public/deployment.json", serialize(proof) + "\n");
console.log(
  "VERIFIED",
  proof.contractAddress,
  "transactions",
  Object.keys(proof.transactions).length,
);
