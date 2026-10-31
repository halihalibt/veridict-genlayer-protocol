# VERIDICT

**Live website: [Open VERIDICT →](https://halihalibt.github.io/veridict-genlayer-protocol/)**

https://halihalibt.github.io/veridict-genlayer-protocol/

**Evidence before outcome.**

VERIDICT records natural-language agreements, assesses public evidence against weighted acceptance criteria, and exposes a traceable decision on GenLayer Stable Studionet.

An agreement creator defines the clause, evidence URL, beneficiary, criteria and weights. GenVM fetches the source, commits its snapshot, and runs independent criterion assessment. Validators must agree on the complete PASS / FAIL / UNKNOWN vector. The contract computes the nominal allocation from the agreed weights; the model never chooses the payout percentage.

This deployment uses **nominal TEST units**. It does not receive, lock, transfer or release USDC or other assets. The class name `VeridictEscrow` identifies the agreement engine, not an implemented token vault.

## Deployment

- Network: **Stable Studionet**, chain **61999** (`0xf22f`)
- RPC: `https://studio.genlayer.com/api`
- Contract: [`0x5F59e0d421336FFEbDBf143a60637ae72d50Ab04`](https://explorer-studio.genlayer.com/contracts/0x5F59e0d421336FFEbDBf143a60637ae72d50Ab04)
- Deployment transaction: [`0xb58c95103246ed5c9555424ab3a426ebe93cdaed5266fd94c997a1405a81d3ce`](https://explorer-studio.genlayer.com/tx/0xb58c95103246ed5c9555424ab3a426ebe93cdaed5266fd94c997a1405a81d3ce)
- Source SHA-256: `41c2e0b443e382b30e1ad11480e8333fda9367cfe31933a5514bccfae9dc8c4a`

The interface checks the deployed source against this digest. [Execution records](evidence/onchain.json) include transaction hashes, observed contract state, the actual evidence snapshot and its hash. Each transaction's receipt is stored under `evidence/`.

Contract decision status `FINALIZED` means the application assessment is complete. It is distinct from the network transaction's finality. The application reads **latest-nonfinal** state after accepted consensus, and exports that state variant explicitly. Inspect the transaction for its current network status.

## Use the chamber

1. Create a dedicated Studio test account, or connect a compatible browser wallet on chain 61999. The dedicated account exists only in this browser tab's session; do not deposit assets into it.
2. Select a template. Change the clause, public HTTPS evidence URL, nominal amount and criteria as needed. Criterion weights must sum to 100%.
3. Select **Create agreement on Studionet**. Wait for consensus acceptance and the contract state to load.
4. Submit the claimant statement with **Adjudicate claim**. The statement is untrusted and is never used as proof on its own.
5. Inspect criterion findings, verbatim source quotes, the committed snapshot, its SHA-256 and transaction hashes. Export the decision as JSON.
6. Either agreement party can request one application-level evidence review. Re-adjudication fetches the same agreed URL again, preserves the first assessment and appends the new revision. The agreement's source and criteria remain immutable.

Use **Read verified examples** without a wallet to inspect existing decisions. These examples fetch the real public [Example Domain](https://example.com/) page; they are acceptance-workflow demonstrations, not claims about an actual client engagement or completed security audit.

| Agreement | Observed decision | Nominal allocation |
| --- | --- | --- |
| `VRD-FULL-01` | `FULFILLED` | 100% |
| `VRD-PARTIAL-01` | `PARTIAL_SETTLEMENT` | 70% |
| `VRD-UNKNOWN-01` | `INSUFFICIENT_EVIDENCE` / `REVIEW_REQUIRED` | Held at 0% |

`VRD-PARTIAL-01` also has an on-chain review request and a second assessment, with both revisions retained.

## Decision and validation

1. Every validator fetches the evidence. `gl.eq_principle.strict_eq` requires an identical source snapshot.
2. The leader assesses each criterion as PASS, FAIL or UNKNOWN, with an explanation and a verbatim source quote. Missing evidence must be UNKNOWN, not a guessed failure or success.
3. `gl.vm.run_nondet_unsafe` runs a custom validator that repeats assessment independently, validates the quote against the committed snapshot (case and whitespace normalized), and requires exact agreement on criterion statuses and the derived outcome.
4. **Audited** mode additionally asks the validator to verify the logical relationship between each criterion, quote, status and explanation.
5. If any criterion is UNKNOWN, the entire nominal allocation is held for review. Otherwise it equals the sum of PASS weights. All PASS is `FULFILLED`, all FAIL is `BREACH_CONFIRMED`, and a mix is `PARTIAL_SETTLEMENT`.

The application cannot choose network validators, determine their model providers, set a 5-to-9-node escalation, or slash GEN. Evidence review is an application state transition, separate from protocol-level appeals.

Source content can be false, incomplete, compromised or prompt-injected. Independent assessment and exact quotes do not authenticate a source. Changing pages may fail strict equivalence; use small, stable public evidence endpoints (20–24,000 UTF-8 characters) and explicit criteria. A single source does not independently prove external events. Larger files, private endpoints and asset custody are outside this version's scope.

## Run locally

Node.js 22 and Python 3 are sufficient. No paid API keys are required.

```sh
npm ci
python3 contracts/test_veridict_contract.py
npm run dev
npm run build
```

The unit tests import the actual deployed contract source and mock only GenVM host functions. They exercise access controls, duplicate and replay guards, weight math, quote grounding, validator disagreement, fail-closed handling and review history. They do not substitute for real consensus execution.

[Remote guard checks](evidence/guards.json) use GenVM `gen_call` write simulation to verify rejection of unauthorized access, overwrites, replay and excessive reviews without committing extra transactions.

## Verify the public deployment

```sh
npm run verify:onchain
```

This read-only command verifies the network, source, evidence hashes, outcomes, review history and transaction execution status. It does not need a wallet or private key.

For a separate deployment or to resume an incomplete deployment, run `npm run deploy:studionet` in a copy without the existing `evidence/onchain.json` and its receipts. Preserve the published execution records before starting a new deployment.

The deployment script refuses any chain other than 61999 and uses a locally generated, dedicated Studio account. It stores the key in ignored `.local/` with restricted permissions. Keep that directory private. It checkpoints submitted hashes, resumes existing transactions, verifies the deployed source byte-for-byte, and reads every decision back. Never publish personal wallet keys or send them in chat.

To run the additional rejection checks after your own deployment (using its original local operator account):

```sh
node scripts/guard-checks.mjs
```

## Code map

- `contracts/veridict_escrow.py`: deployed agreement state machine and custom validator
- `contracts/test_veridict_contract.py`: tests against the actual source
- `src/App.tsx`: agreement editor, decisions, evidence, history and transaction journal
- `src/chain.ts`: pinned-chain clients, source checks, wallet/test-account signing and receipt polling
- `scripts/onchain.mjs`: checkpointed deployment and live verification
- `evidence/`: public transaction receipts and observed states
- `.github/workflows/pages.yml`: tests, production build and GitHub Pages deployment

GitHub Pages serves a static build. Relative Vite assets support repository subpaths. The RPC and SDK are fixed to Stable Studionet; this app does not switch to another network as a fallback.
