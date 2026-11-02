import test from "node:test";
import assert from "node:assert/strict";
import {
  FINALITY_TIMEOUT_MS,
  FINALITY_INTERVAL_MS,
  FinalityTimeout,
  FinalizedReadError,
  pollFinalized,
  isTrackingTerminal,
  finalityDelay,
} from "../src/finality.ts";

const hash = "0x" + "a".repeat(64);
const record = { id: "VRD-MOCK", status: "FINALIZED" };
function harness(receipts) {
  let time = 0,
    calls = 0,
    reads = 0;
  const updates = [],
    waits = [];
  return {
    options: {
      hash,
      getTransaction: async () => {
        const receipt = receipts[Math.min(calls++, receipts.length - 1)];
        // A previous ACCEPTED response must not have triggered the final read.
        if (calls <= receipts.length) assert.equal(reads, 0);
        return receipt;
      },
      readFinal: async () => {
        reads++;
        return record;
      },
      onStatus: (status) => updates.push(status),
      now: () => time,
      sleep: async (ms) => {
        waits.push(ms);
        time += ms;
      },
    },
    updates,
    waits,
    get reads() {
      return reads;
    },
    get calls() {
      return calls;
    },
  };
}

test("PENDING → ACCEPTED → FINALIZED: only FINALIZED permits the final read", async () => {
  const h = harness([
    { statusName: "PENDING" },
    { statusName: "ACCEPTED" },
    { statusName: "FINALIZED" },
  ]);
  assert.equal(await pollFinalized(h.options), record);
  assert.deepEqual(h.updates, ["PENDING", "ACCEPTED", "FINALIZED"]);
  assert.equal(h.reads, 1);
  assert.deepEqual(h.waits, [3000, 3000]);
});

test("reload recovery keeps polling a saved ACCEPTED transaction through finality", async () => {
  const saved = JSON.parse(
    JSON.stringify({ hash, status: "ACCEPTED", agreementId: "VRD-MOCK" }),
  );
  assert.equal(isTrackingTerminal(saved.status), false);
  const h = harness([
    { statusName: "ACCEPTED" },
    { statusName: "ACCEPTED" },
    { statusName: "FINALIZED" },
  ]);
  const result = await pollFinalized({
    ...h.options,
    hash: saved.hash,
    onStatus: (status) => {
      saved.status = status;
      h.updates.push(status);
    },
  });
  assert.equal(saved.status, "FINALIZED");
  assert.equal(result, record);
  assert.equal(h.calls, 3);
  assert.equal(h.reads, 1);
  assert.deepEqual(h.waits, [3000, 3000]);
});

test("nine-minute timeout preserves hash, does not mark failure, read or resend", async () => {
  const h = harness([{ statusName: "ACCEPTED" }]);
  assert.equal(FINALITY_TIMEOUT_MS, 540000);
  assert.equal(FINALITY_INTERVAL_MS, 3000);
  await assert.rejects(pollFinalized(h.options), (error) => {
    assert.ok(error instanceof FinalityTimeout);
    assert.ok(error.message.includes(hash));
    assert.match(error.message, /awaiting final confirmation/i);
    assert.match(error.message, /Recheck.*hash later/i);
    assert.match(error.message, /Do not resubmit blindly/);
    assert.doesNotMatch(error.message, /failed|failure/i);
    return true;
  });
  assert.equal(h.reads, 0);
  assert.equal(h.calls, 180);
  assert.equal(
    h.waits.reduce((n, ms) => n + ms, 0),
    540000,
  );
  assert.ok(h.updates.every((s) => s === "ACCEPTED"));
  // The polling API accepts read callbacks only, never a write/resubmit callback.
});

test("SDK numeric states 5 and 7 remain intermediate and final respectively", async () => {
  const h = harness([{ status: 5 }, { status: 7 }]);
  await pollFinalized(h.options);
  assert.deepEqual(h.updates, ["ACCEPTED", "FINALIZED"]);
  assert.equal(h.reads, 1);
  assert.equal(h.waits.length, 1);
});

test("execution error and failed consensus stop without a state read", async () => {
  const h = harness([
    {
      statusName: "ACCEPTED",
      consensus_data: {
        leader_receipt: [
          { execution_result: "ERROR", error: "guard rejected" },
        ],
      },
    },
  ]);
  await assert.rejects(pollFinalized(h.options), /guard rejected/);
  assert.deepEqual(h.updates, ["ACCEPTED", "EXECUTION_FAILED"]);
  assert.equal(h.reads, 0);
  for (const status of [
    "UNDETERMINED",
    "CANCELED",
    "LEADER_TIMEOUT",
    "VALIDATORS_TIMEOUT",
  ]) {
    const f = harness([{ statusName: status }]);
    await assert.rejects(pollFinalized(f.options), new RegExp(status));
    assert.equal(f.reads, 0);
    assert.equal(f.calls, 1);
    assert.equal(isTrackingTerminal(status), true);
  }
});

test("missing or failed final read retains a finalized hash and can be retried without writing", async () => {
  for (const readFinal of [
    async () => null,
    async () => {
      throw Error("temporary RPC error");
    },
  ]) {
    const h = harness([{ statusName: "FINALIZED" }]);
    await assert.rejects(
      pollFinalized({ ...h.options, readFinal }),
      (error) => {
        assert.ok(error instanceof FinalizedReadError);
        assert.ok(error.message.includes(hash));
        assert.match(error.message, /Retry final read/);
        assert.match(error.message, /do not resubmit/i);
        return true;
      },
    );
    assert.deepEqual(h.updates, ["FINALIZED"]);
    const retry = harness([{ statusName: "FINALIZED" }]);
    assert.equal(await pollFinalized(retry.options), record);
    assert.equal(retry.reads, 1);
  }
});

test("unmount abort cancels the pending sleep and prevents later callbacks", async () => {
  const controller = new AbortController();
  let calls = 0,
    reads = 0;
  const updates = [];
  const waiting = pollFinalized({
    hash,
    signal: controller.signal,
    getTransaction: async () => {
      calls++;
      return { statusName: "ACCEPTED" };
    },
    readFinal: async () => {
      reads++;
      return record;
    },
    onStatus: (status) => {
      updates.push(status);
      queueMicrotask(() => controller.abort());
    },
  });
  await assert.rejects(waiting, { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(reads, 0);
  assert.deepEqual(updates, ["ACCEPTED"]);
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  assert.throws(() => finalityDelay(3000, alreadyAborted.signal), {
    name: "AbortError",
  });
});
