import { transactionsStatusNumberToName } from "genlayer-js/types";

export const FINALITY_TIMEOUT_MS = 540000;
export const FINALITY_INTERVAL_MS = 3000;
const failedConsensus = new Set([
  "UNDETERMINED",
  "CANCELED",
  "LEADER_TIMEOUT",
  "VALIDATORS_TIMEOUT",
]);
export interface Receipt {
  status?: string | number;
  statusName?: string;
  consensus_data?: {
    leader_receipt?: { execution_result?: string; error?: string | null }[];
  };
}
export function receiptStatus(receipt: Receipt): string {
  const code = String(receipt.status ?? "");
  return (
    receipt.statusName ||
    transactionsStatusNumberToName[
      code as keyof typeof transactionsStatusNumberToName
    ] ||
    code ||
    "PENDING"
  );
}
export function isTrackingTerminal(status: string): boolean {
  const name = receiptStatus({ status });
  return (
    name === "FINALIZED" ||
    name === "EXECUTION_FAILED" ||
    failedConsensus.has(name)
  );
}
export function executionFailure(receipt: Receipt) {
  return (receipt.consensus_data?.leader_receipt || []).find(
    (r) =>
      r.execution_result &&
      !["SUCCESS", "success"].includes(r.execution_result),
  );
}
export class FinalityTimeout extends Error {
  constructor(hash: string) {
    super(
      `Still awaiting final confirmation: ${hash}. Recheck this transaction hash later. Do not resubmit blindly.`,
    );
    this.name = "FinalityTimeout";
  }
}
export class FinalizedReadError extends Error {
  constructor(hash: string) {
    super(
      `Transaction ${hash} is FINALIZED, but its agreement could not be read. Use Retry final read in the transaction journal; do not resubmit the transaction.`,
    );
    this.name = "FinalizedReadError";
  }
}
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Tracking stopped", "AbortError");
}
export function finalityDelay(ms: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new DOMException("Tracking stopped", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
/** Read-only polling shared by submitted writes and saved-transaction recovery. */
export async function pollFinalized<T>({
  hash,
  getTransaction,
  readFinal,
  onStatus,
  signal,
  timeoutMs = FINALITY_TIMEOUT_MS,
  intervalMs = FINALITY_INTERVAL_MS,
  now = Date.now,
  sleep = finalityDelay,
}: {
  hash: string;
  getTransaction: () => Promise<Receipt>;
  readFinal: () => Promise<T | null>;
  onStatus: (status: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<T> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    checkAbort(signal);
    const receipt = await getTransaction();
    checkAbort(signal);
    const status = receiptStatus(receipt);
    onStatus(status);
    checkAbort(signal);
    const failed = executionFailure(receipt);
    if (failed) {
      onStatus("EXECUTION_FAILED");
      throw Error(
        `${failed.error || "Contract execution failed"}. Inspect transaction ${hash}.`,
      );
    }
    if (failedConsensus.has(status))
      throw Error(
        `Consensus ${status}. Inspect transaction ${hash} and reload its agreement.`,
      );
    if (status === "FINALIZED") {
      let record: T | null;
      try {
        record = await readFinal();
      } catch {
        checkAbort(signal);
        throw new FinalizedReadError(hash);
      }
      checkAbort(signal);
      if (record === null) throw new FinalizedReadError(hash);
      return record;
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())), signal);
  }
  checkAbort(signal);
  throw new FinalityTimeout(hash);
}
