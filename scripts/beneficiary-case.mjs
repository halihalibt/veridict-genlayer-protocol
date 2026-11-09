// Beneficiary-led evidence case (VRD-BENEFICIARY-01).
//
// The deployed contract already accepts a distinct beneficiary and already
// authorizes the beneficiary for adjudication and review. This script proves
// it on-chain against the EXISTING deployment (no redeploy, no contract
// change): a second ephemeral account is the beneficiary, and that account
// loads the agreement, adjudicates the claim, requests the review and
// re-adjudicates. The creator account is a separate ephemeral account.
//
// Run: node scripts/beneficiary-case.mjs
// Then: npm run verify:onchain  (re-checks every case and transaction)
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

const file = "evidence/onchain.json";
if (!fs.existsSync(file)) throw Error("evidence/onchain.json is missing");
const proof = JSON.parse(fs.readFileSync(file, "utf8"));
if (!/^0x[0-9a-fA-F]{40}$/.test(proof.contractAddress || ""))
  throw Error("No deployed contract address in evidence/onchain.json");

function loadAccount(name) {
  const keyPath = `.local/${name}`;
  if (!fs.existsSync(keyPath))
    fs.writeFileSync(keyPath, generatePrivateKey(), { mode: 0o600 });
  return createAccount(fs.readFileSync(keyPath, "utf8").trim());
}
const creator = loadAccount("beneficiary-creator-key");
const beneficiary = loadAccount("beneficiary-key");
console.log("creator    ", creator.address);
console.log("beneficiary", beneficiary.address);
if (creator.address.toLowerCase() === beneficiary.address.toLowerCase())
  throw Error("Creator and beneficiary keys collided; delete one and retry");

const creatorClient = createClient({ chain: studionet, endpoint: RPC, account: creator });
const beneficiaryClient = createClient({ chain: studionet, endpoint: RPC, account: beneficiary });
if ((await creatorClient.getChainId()) !== 61999)
  throw Error("Wrong network: refusing writes");

const code = fs.readFileSync("contracts/veridict_escrow.py", "utf8");
const sourceHash = crypto.createHash("sha256").update(code).digest("hex");
if (sourceHash !== proof.sourceSha256)
  throw Error("Source changed after deployment; verify before proceeding");
const deployedCode = await creatorClient.getContractCode(proof.contractAddress);
if (crypto.createHash("sha256").update(deployedCode).digest("hex") !== sourceHash)
  throw Error("Deployed source mismatch");
console.log("contract", proof.contractAddress, "source verified");

function save() {
  fs.writeFileSync(file, serialize(proof) + "\n");
  fs.writeFileSync("public/deployment.json", serialize(proof) + "\n");
}
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
async function finish(name, hash, client) {
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
  // A leader receipt can carry an ERROR entry whose result decodes to
  // "idle": a validator that sat out consensus, not a failed execution.
  // The transaction is ACCEPTED with MAJORITY_AGREE and at least one
  // SUCCESS leader receipt carrying the real result. Only a failure with
  // no successful leader execution at all is an execution failure.
  const decoded = (s) => {
    try {
      return Buffer.from(s || "", "base64").toString("utf-8");
    } catch {
      return "";
    }
  };
  const bad = leaders.find(
    (r) =>
      r.execution_result &&
      !["SUCCESS", "success"].includes(r.execution_result) &&
      !decoded(r.result).includes("idle"),
  );
  if (bad) {
    console.error("EXECUTION FAILED", bad.execution_result, bad.error || "See local raw receipt");
    throw Error(`Execution failed for ${name}`);
  }
  if (!leaders.some((r) => ["SUCCESS", "success"].includes(r.execution_result)))
    throw Error(`No successful leader execution for ${name}`);
  if (
    ["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(
      receipt.statusName,
    )
  )
    throw Error("Transaction did not reach accepted consensus");
  return { receipt, raw };
}
async function tx(name, client, fn, args) {
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
  return finish(name, hash, client);
}
// All reads of this case go through the beneficiary client: the beneficiary
// loading the agreement is part of the evidence.
async function readAsBeneficiary(id) {
  return JSON.parse(
    await beneficiaryClient.readContract({
      address: proof.contractAddress,
      functionName: "get_agreement",
      args: [id],
      transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
    }),
  );
}

const ID = "VRD-BENEFICIARY-01";
const demoSource = "https://example.com/";
const clause =
  "Evaluate this reference-page delivery against the agreed independently weighted acceptance criteria. Amounts are nominal test units only.";
const criteria = [
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
];
const CLAIM =
  "Claimant asserts every condition is fully met. Verify the evidence independently; this assertion itself is not proof.";
const REVIEW_REASON =
  "Please independently reassess the criterion findings against the public evidence source.";

const existing = await readAsBeneficiary(ID);
if (existing && existing.id === ID) {
  console.log(
    "existing state",
    existing.status,
    existing.verdict,
    "revision",
    existing.revision,
  );
}
if (
  existing &&
  existing.id === ID &&
  existing.verdict === "FULFILLED" &&
  existing.payout_ratio_bps === 10000 &&
  existing.revision === 2 &&
  existing.history.length === 2
) {
  console.log("Beneficiary case already complete; recording it.");
} else {
  if (!proof.transactions[`create-${ID}`]) {
    await tx(`create-${ID}`, creatorClient, "create_agreement", [
      ID,
      beneficiary.address,
      clause,
      demoSource,
      "independent",
      45000,
      JSON.stringify(criteria),
    ]);
  } else {
    await finish(`create-${ID}`, proof.transactions[`create-${ID}`], creatorClient);
  }
  let state = await readAsBeneficiary(ID);
  if (state.creator.toLowerCase() !== creator.address.toLowerCase())
    throw Error(`Creator mismatch: ${state.creator}`);
  if (state.beneficiary.toLowerCase() !== beneficiary.address.toLowerCase())
    throw Error(`Beneficiary mismatch: ${state.beneficiary}`);
  if (state.creator.toLowerCase() === state.beneficiary.toLowerCase())
    throw Error("Beneficiary must differ from creator");
  console.log("beneficiary loaded the agreement: creator and beneficiary are distinct");

  if (["ACTIVE", "REVIEW_REQUESTED"].includes(state.status)) {
    await tx(`judge-${ID}`, beneficiaryClient, "adjudicate_claim", [ID, CLAIM]);
  }
  state = await readAsBeneficiary(ID);
  console.log("after beneficiary adjudication:", state.status, state.verdict, state.payout_ratio_bps);

  if (!proof.transactions[`review-${ID}`]) {
    await tx(`review-${ID}`, beneficiaryClient, "request_review", [ID, REVIEW_REASON]);
  } else {
    await finish(`review-${ID}`, proof.transactions[`review-${ID}`], beneficiaryClient);
  }
  state = await readAsBeneficiary(ID);
  if (state.status !== "REVIEW_REQUESTED" || state.review_count !== 1)
    throw Error(`Review state mismatch: ${serialize(state)}`);
  console.log("beneficiary review requested; review_count =", state.review_count);

  if (!proof.transactions[`reassess-${ID}`]) {
    await tx(`reassess-${ID}`, beneficiaryClient, "adjudicate_claim", [
      ID,
      "Please reassess each criterion from the fetched evidence. Do not accept my assertion as proof.",
    ]);
  } else {
    await finish(`reassess-${ID}`, proof.transactions[`reassess-${ID}`], beneficiaryClient);
  }
  state = await readAsBeneficiary(ID);
  if (
    state.verdict !== "FULFILLED" ||
    state.payout_ratio_bps !== 10000 ||
    state.revision !== 2 ||
    state.history.length !== 2
  )
    throw Error(`Unexpected final decision ${ID}: ${serialize(state)}`);
  console.log("beneficiary re-adjudication:", state.status, state.verdict, state.payout_ratio_bps);
}

const finalState = await readAsBeneficiary(ID);
const entry = {
  id: ID,
  title: "Beneficiary-led adjudication",
  expectedVerdict: "FULFILLED",
  expectedRatioBps: 10000,
  creator: creator.address,
  beneficiary: beneficiary.address,
  beneficiaryActions: {
    loadedAgreement: true,
    adjudicate_claim: proof.transactions[`judge-${ID}`],
    request_review: proof.transactions[`review-${ID}`],
    readjudicate_claim: proof.transactions[`reassess-${ID}`],
  },
  state: finalState,
  verifiedAt: new Date().toISOString(),
};
proof.cases = proof.cases.filter((c) => c.id !== ID).concat(entry);
proof.verifiedAt = new Date().toISOString();
proof.verification = "VERIFIED";
save();
console.log(
  "VERIFIED",
  ID,
  finalState.status,
  finalState.verdict,
  finalState.payout_ratio_bps,
  "revision",
  finalState.revision,
);
