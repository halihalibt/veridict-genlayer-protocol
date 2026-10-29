import { sha256, toBytes } from "viem";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  TransactionHashVariant,
  type TransactionHash,
} from "genlayer-js/types";
import type { Agreement, Deployment, TxEntry } from "./types/veridict";
const endpoint = "https://studio.genlayer.com/api";
type Client = ReturnType<typeof createClient>;
type Provider = NonNullable<Parameters<typeof createClient>[0]>["provider"];
let writer: Client | null = null;
const reader = createClient({ chain: studionet, endpoint });
export function activeTestAccount() {
  const key = sessionStorage.getItem("veridict-test-key") as
    | `0x${string}`
    | null;
  if (!key) return null;
  const account = createAccount(key);
  writer = createClient({ chain: studionet, endpoint, account });
  return account.address;
}
export function newTestAccount() {
  const key = generatePrivateKey();
  sessionStorage.setItem("veridict-test-key", key);
  return activeTestAccount()!;
}
export async function connectWallet() {
  const w = window as unknown as { okxwallet?: Provider; ethereum?: Provider };
  const provider = w.okxwallet || w.ethereum;
  if (!provider)
    throw Error(
      "No browser wallet found. Use the dedicated free Studio test account, or install your wallet extension.",
    );
  const addresses = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!addresses?.[0]) throw Error("Wallet returned no account");
  const chain = await provider.request({ method: "eth_chainId" });
  if (Number.parseInt(String(chain), 16) !== 61999) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xf22f" }],
      });
    } catch (e) {
      throw Error(
        "Switch your wallet to GenLayer Stable Studionet (61999), then reconnect.",
      );
    }
  }
  writer = createClient({
    chain: studionet,
    endpoint,
    account: addresses[0] as `0x${string}`,
    provider,
  });
  return addresses[0];
}
export async function readAgreement(
  deployment: Deployment,
  id: string,
): Promise<Agreement | null> {
  const raw = await reader.readContract({
    address: deployment.contractAddress,
    functionName: "get_agreement",
    args: [id],
    transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
  });
  const result = typeof raw === "string" ? JSON.parse(raw) : raw;
  return result && typeof result === "object" && "id" in result
    ? (result as Agreement)
    : null;
}
export async function verifySource(deployment: Deployment) {
  if ((await reader.getChainId()) !== 61999) throw Error("Incorrect network");
  const code = await reader.getContractCode(deployment.contractAddress);
  const digest = sha256(toBytes(code)).slice(2);
  if (digest !== deployment.sourceSha256)
    throw Error("Deployed code does not match the published source digest");
  return digest;
}
export async function writeAgreement(
  deployment: Deployment,
  id: string,
  method: string,
  args: (string | number)[],
  onUpdate: (tx: TxEntry) => void,
) {
  if (!writer)
    throw Error("Choose a test account or connect your wallet first");
  if ((await writer.getChainId()) !== 61999)
    throw Error("Incorrect network: write refused");
  const hash = (await writer.writeContract({
    address: deployment.contractAddress,
    functionName: method,
    args,
    value: 0n,
  })) as `0x${string}`;
  let tx: TxEntry = {
    hash,
    action: method,
    status: "PENDING",
    agreementId: id,
  };
  onUpdate(tx);
  const deadline = Date.now() + 540000;
  while (Date.now() < deadline) {
    const receipt = await reader.getTransaction({
      hash: hash as TransactionHash,
    });
    const status = String(receipt.statusName || receipt.status || "PENDING");
    tx = { ...tx, status };
    onUpdate(tx);
    if (
      ["ACCEPTED", "FINALIZED"].includes(status) ||
      [5, 7].includes(Number(receipt.status))
    ) {
      const leaders = receipt.consensus_data?.leader_receipt || [];
      const failed = leaders.find(
        (r) =>
          r.execution_result &&
          !["SUCCESS", "success"].includes(r.execution_result),
      );
      if (failed) {
        onUpdate({ ...tx, status: "EXECUTION_FAILED" });
        throw Error(
          failed.error ||
            `Contract execution failed. Inspect transaction ${hash}.`,
        );
      }
      return readAgreement(deployment, id);
    }
    if (
      [
        "UNDETERMINED",
        "CANCELED",
        "LEADER_TIMEOUT",
        "VALIDATORS_TIMEOUT",
      ].includes(status)
    )
      throw Error(
        `Consensus ${status}. Inspect the transaction and reload its agreement.`,
      );
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw Error(
    `Still pending: ${hash}. Save this transaction and reload its agreement later. Do not resubmit blindly.`,
  );
}
export function explorerTx(hash: string) {
  return `https://explorer-studio.genlayer.com/tx/${hash}`;
}
export function explorerContract(address: string) {
  return `https://explorer-studio.genlayer.com/contracts/${address}`;
}

export async function transactionStatus(hash: `0x${string}`) {
  const receipt = await reader.getTransaction({
    hash: hash as TransactionHash,
  });
  const failed = (receipt.consensus_data?.leader_receipt || []).some(
    (r) =>
      r.execution_result &&
      !["SUCCESS", "success"].includes(r.execution_result),
  );
  return failed
    ? "EXECUTION_FAILED"
    : String(receipt.statusName || receipt.status || "PENDING");
}
