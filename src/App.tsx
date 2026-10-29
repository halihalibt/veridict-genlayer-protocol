import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  FileCode2,
  Fingerprint,
  Layers3,
  Link2,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Scale,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import { probeStudionetRpc, type RpcProbeResult } from "./config/studionet";
import { CASE_SCENARIOS } from "./data/scenarios";
import { soundEngine } from "./audio/soundEngine";
import {
  activeTestAccount,
  connectWallet,
  explorerContract,
  explorerTx,
  newTestAccount,
  readAgreement,
  verifySource,
  writeAgreement,
  transactionStatus,
} from "./chain";
import type {
  Agreement,
  Criterion,
  Deployment,
  TxEntry,
} from "./types/veridict";
import "./style.css";

const short = (s: string) => (s ? `${s.slice(0, 8)}…${s.slice(-6)}` : "—");
const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const uid = () =>
  `VRD-${Date.now().toString(36).toUpperCase()}-${randomId().slice(0, 4).toUpperCase()}`;
const initialClause =
  "Evaluate this reference-page delivery against the agreed independently weighted acceptance criteria. Amounts are nominal test units only.";
function saveJson(name: string, data: unknown) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Chamber({ active }: { active: boolean }) {
  return (
    <div className={`chamber ${active ? "working" : ""}`} aria-hidden="true">
      <div className="chamber-halo" />
      <svg viewBox="0 0 520 360" className="chamber-svg">
        <defs>
          <linearGradient id="metal" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#e4c485" />
            <stop offset=".5" stopColor="#9a7439" />
            <stop offset="1" stopColor="#edddb5" />
          </linearGradient>
          <radialGradient id="sphere">
            <stop stopColor="#8be9e5" stopOpacity=".25" />
            <stop offset="1" stopColor="#171c20" stopOpacity=".1" />
          </radialGradient>
        </defs>
        <g fill="none">
          <ellipse
            cx="260"
            cy="300"
            rx="215"
            ry="30"
            stroke="#c9a86d"
            opacity=".14"
          />
          <ellipse
            cx="260"
            cy="300"
            rx="152"
            ry="21"
            stroke="#c9a86d"
            opacity=".2"
          />
          <path
            d="M60 300L260 195 460 300M100 300L260 218 420 300"
            stroke="#c9a86d"
            opacity=".15"
          />
          <circle cx="260" cy="170" r="118" stroke="#c9a86d" opacity=".15" />
          <circle
            cx="260"
            cy="170"
            r="96"
            stroke="url(#metal)"
            strokeWidth="1.5"
          />
          <ellipse
            className="orbit-a"
            cx="260"
            cy="170"
            rx="148"
            ry="45"
            stroke="#c9a86d"
          />
          <ellipse
            className="orbit-b"
            cx="260"
            cy="170"
            rx="45"
            ry="136"
            stroke="#75bdb9"
            opacity=".65"
          />
          <ellipse cx="260" cy="170" rx="95" ry="96" fill="url(#sphere)" />
          <path
            d="M260 96V242M203 127H317M260 109L216 169H304L260 109ZM203 127L171 199H235L203 127ZM317 127L285 199H349L317 127Z"
            stroke="url(#metal)"
            strokeWidth="2"
          />
          <path
            d="M171 199Q203 235 235 199M285 199Q317 235 349 199M231 242H289"
            stroke="url(#metal)"
            strokeWidth="2"
          />
          <circle cx="260" cy="109" r="4" fill="#e7d0a5" />
          {[
            [112, 170],
            [260, 34],
            [408, 170],
            [260, 306],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r="6"
                fill="#0b1015"
                stroke={i % 2 ? "#75bdb9" : "#c9a86d"}
              />
              <circle
                cx={x}
                cy={y}
                r="2"
                fill={i % 2 ? "#75bdb9" : "#c9a86d"}
              />
            </g>
          ))}
        </g>
      </svg>
      <span className="chamber-label">EVIDENCE → CONSENSUS → DECISION</span>
    </div>
  );
}

export default function App() {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [rpc, setRpc] = useState<RpcProbeResult | null>(null);
  const [sourceStatus, setSourceStatus] = useState<
    "checking" | "verified" | "error"
  >("checking");
  const [address, setAddress] = useState("");
  const [accountKind, setAccountKind] = useState("");
  const [audio, setAudio] = useState(false);
  const [template, setTemplate] = useState(0);
  const [id, setId] = useState(
    () => sessionStorage.getItem("veridict-last-id") || uid(),
  );
  const [clause, setClause] = useState(initialClause);
  const [url, setUrl] = useState("https://example.com/");
  const [amount, setAmount] = useState(45000);
  const [mode, setMode] = useState<"independent" | "audited">("independent");
  const [criteria, setCriteria] = useState<Criterion[]>(
    CASE_SCENARIOS[0].criteria.map((c) => ({ ...c })),
  );
  const [claim, setClaim] = useState(
    "Claimant asserts every condition is fully met. Verify the evidence independently; this assertion itself is not proof.",
  );
  const [reason, setReason] = useState(
    "Please independently reassess the criterion findings against the public evidence source.",
  );
  const [record, setRecord] = useState<Agreement | null>(null);
  const [busy, setBusy] = useState("");
  const [operationHash, setOperationHash] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"findings" | "source" | "history">("findings");
  const [ledger, setLedger] = useState<TxEntry[]>(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("veridict-transactions") || "[]",
      );
    } catch {
      return [];
    }
  });
  const workspace = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    const account = activeTestAccount();
    if (account) {
      setAddress(account);
      setAccountKind("Studio test account");
    }
    probeStudionetRpc().then((r) => live && setRpc(r));
    const saved: TxEntry[] = JSON.parse(
      sessionStorage.getItem("veridict-transactions") || "[]",
    );
    saved
      .filter(
        (t) =>
          !["ACCEPTED", "FINALIZED", "EXECUTION_FAILED"].includes(t.status),
      )
      .forEach((t) => {
        transactionStatus(t.hash)
          .then((status) => {
            if (live)
              setLedger((prev) =>
                prev.map((x) => (x.hash === t.hash ? { ...x, status } : x)),
              );
          })
          .catch(() => {});
      });
    fetch(`${import.meta.env.BASE_URL}deployment.json`)
      .then((r) => {
        if (!r.ok) throw Error("Deployment metadata is unavailable");
        return r.json();
      })
      .then(async (d: Deployment) => {
        if (d.chainId !== 61999 || !d.contractAddress)
          throw Error("Invalid deployment metadata");
        if (!live) return;
        setDeployment(d);
        await verifySource(d);
        if (live) setSourceStatus("verified");
        const last = sessionStorage.getItem("veridict-last-id");
        if (last) {
          const r = await readAgreement(d, last);
          if (live && r) hydrate(r);
        }
      })
      .catch((e) => {
        if (live) {
          setSourceStatus("error");
          setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    sessionStorage.setItem("veridict-transactions", JSON.stringify(ledger));
  }, [ledger]);
  function hydrate(r: Agreement) {
    setRecord(r);
    setId(r.id);
    setClause(r.clause);
    setUrl(r.evidence_url);
    setAmount(r.escrow_amount);
    setMode(r.equivalence_mode);
    setCriteria(r.criteria);
    if (r.claimant_statement) setClaim(r.claimant_statement);
    sessionStorage.setItem("veridict-last-id", r.id);
  }
  function fresh(index = template) {
    const t = CASE_SCENARIOS[index];
    setTemplate(index);
    setRecord(null);
    setId(uid());
    sessionStorage.removeItem("veridict-last-id");
    setClause(initialClause);
    setUrl("https://example.com/");
    setAmount(45000);
    setMode(t.mode);
    setCriteria(t.criteria.map((c) => ({ ...c })));
    setError("");
    setNote("");
    setTab("findings");
    soundEngine.playClick();
  }
  async function perform(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setOperationHash(null);
    setError("");
    setNote("");
    try {
      await fn();
      soundEngine.playFinalityChord();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy("");
    }
  }
  function txUpdate(tx: TxEntry) {
    setOperationHash(tx.hash);
    setLedger((prev) =>
      [tx, ...prev.filter((t) => t.hash !== tx.hash)].slice(0, 24),
    );
  }
  async function write(method: string, args: (string | number)[]) {
    if (!deployment) throw Error("Deployment not loaded");
    const r = await writeAgreement(deployment, id, method, args, txUpdate);
    if (!r)
      throw Error(
        "Transaction completed without the expected record. Inspect its receipt.",
      );
    hydrate(r);
  }
  const total = criteria.reduce((n, c) => n + c.weight_bps, 0);
  const isParty =
    !!record &&
    [record.creator, record.beneficiary].includes(address.toLowerCase());
  const canJudge =
    isParty &&
    !!record &&
    ["ACTIVE", "REVIEW_REQUESTED"].includes(record.status);
  const locked = !!record || !!busy;
  const completed = !!record?.assessment;
  const publishedLedger: TxEntry[] = deployment
    ? Object.entries(deployment.transactions)
        .filter(
          ([key]) =>
            key.endsWith(id) ||
            (id === "VRD-PARTIAL-01" && ["review", "reassess"].includes(key)),
        )
        .map(([key, hash]) => ({
          hash,
          agreementId: id,
          action: key.startsWith("create-")
            ? "create_agreement"
            : key.startsWith("judge-") || key === "reassess"
              ? "adjudicate_claim"
              : "request_review",
          status: "RECORDED",
        }))
    : [];
  const activeLedger = [
    ...ledger.filter((t) => t.agreementId === id),
    ...publishedLedger.filter((t) => !ledger.some((u) => u.hash === t.hash)),
  ];
  const currentTx = activeLedger.find((t) => t.hash === operationHash);
  const verdictColor =
    record?.verdict === "FULFILLED"
      ? "pass"
      : record?.verdict === "INSUFFICIENT_EVIDENCE"
        ? "unknown"
        : record?.verdict === "PARTIAL_SETTLEMENT"
          ? "partial"
          : "fail";
  const amountText = new Intl.NumberFormat("en-US").format(amount);
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#" aria-label="VERIDICT home">
          <span className="brand-icon">
            V<span>·</span>
          </span>
          <span>
            VERIDICT<small>PROTOCOL / 2.4.1</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#workspace">Adjudication chamber</a>
          <a href="#protocol">The protocol</a>
          <a
            href="https://github.com/halihalibt/veridict-genlayer-protocol"
            target="_blank"
            rel="noreferrer"
          >
            Source <ArrowUpRight size={13} />
          </a>
        </nav>
        <button
          className="icon-button"
          aria-label={audio ? "Mute sound" : "Enable sound"}
          title={audio ? "Mute sound" : "Enable sound"}
          onClick={() => {
            soundEngine.enabled = !audio;
            setAudio(!audio);
            soundEngine.playClick();
          }}
        >
          {audio ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> INTELLIGENT AGREEMENTS. VISIBLE
              PROOF.
            </div>
            <h1>
              Let the evidence
              <br />
              have the <em>final word.</em>
            </h1>
            <p>
              Natural-language agreements. Independent verification.
              <br className="desktop-break" /> A decision you can trace,
              criterion by criterion.
            </p>
            <a
              href="#workspace"
              className="primary hero-cta"
              onClick={() => soundEngine.playClick()}
            >
              Enter the chamber <ArrowUpRight size={17} />
            </a>
            <div className="hero-footnote">
              <span>BUILT ON GENLAYER</span>
              <i />
              <span>STABLE STUDIONET / 61999</span>
            </div>
          </div>
          <Chamber active={!!busy} />
          <div className="hero-number">01 — THE ADJUDICATION LAYER</div>
        </section>
        <div className="network-strip">
          <span>
            <Radio size={14} />
            <b className={rpc?.reachable ? "mint" : "muted"}>
              {rpc
                ? rpc.reachable
                  ? "STUDIONET CONNECTED"
                  : "RPC UNAVAILABLE"
                : "CONNECTING TO STUDIONET"}
            </b>
          </span>
          <span className="strip-latency">
            {rpc?.reachable
              ? `${rpc.latencyMs.toLocaleString()} MS`
              : "61999 / 0xf22f"}
          </span>
          <span className="source-state">
            <Fingerprint size={14} />
            {sourceStatus === "verified"
              ? "DEPLOYED SOURCE VERIFIED"
              : sourceStatus === "checking"
                ? "VERIFYING SOURCE"
                : "SOURCE CHECK FAILED"}
          </span>
          <span>0 VALUE TRANSFER · TEST UNITS ONLY</span>
        </div>
        <section className="workspace-section" id="workspace" ref={workspace}>
          <div className="section-heading">
            <div>
              <div className="eyebrow muted">01 / THE WORKSPACE</div>
              <h2>
                Adjudication chamber<span> / </span>
              </h2>
            </div>
            <div className="workspace-actions">
              {address ? (
                <span className="account-chip">
                  <span className="live-dot" />
                  <span>
                    {short(address)}
                    <small>{accountKind}</small>
                  </span>
                </span>
              ) : (
                <>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      perform("Connecting wallet", async () => {
                        const a = await connectWallet();
                        setAddress(a);
                        setAccountKind("Connected wallet");
                      })
                    }
                  >
                    <Wallet size={14} /> Connect wallet
                  </button>
                  <button
                    className="primary small"
                    disabled={!!busy}
                    onClick={() => {
                      setAddress(newTestAccount());
                      setAccountKind("Studio test account");
                      setNote(
                        "A dedicated free test account is active for this tab. No personal wallet or deposited funds are needed.",
                      );
                    }}
                  >
                    Create test account <Plus size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="notice-line">
            <ShieldCheck size={14} />
            <span>
              Live on Studionet. Nominal amounts record a decision; no USDC,
              token custody, or financial payout is executed.
            </span>
          </div>
          {(error || note) && (
            <div
              className={error ? "feedback error" : "feedback"}
              role={error ? "alert" : "status"}
            >
              <span>{error || note}</span>
              <button
                aria-label="Dismiss message"
                onClick={() => {
                  setError("");
                  setNote("");
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="work-grid">
            <aside className="case-sidebar">
              <div className="panel-label">
                START FROM A TEMPLATE <span>03</span>
              </div>
              {CASE_SCENARIOS.map((t, i) => (
                <button
                  key={t.id}
                  disabled={!!busy}
                  className={`case-card ${template === i ? "selected" : ""}`}
                  onClick={() => fresh(i)}
                >
                  <div className="case-number">
                    {t.category}
                    <ArrowUpRight size={13} />
                  </div>
                  <h3>{t.title}</h3>
                  <p>{t.description}</p>
                  <div className="case-bottom">
                    {i === 1
                      ? "INDEPENDENT + REASONING AUDIT"
                      : "INDEPENDENT VERIFICATION"}
                    <span className="case-indicator" />
                  </div>
                </button>
              ))}
              <div className="references">
                <div className="panel-label">READ VERIFIED EXAMPLES</div>
                {deployment?.cases.map((c) => (
                  <button
                    key={c.id}
                    disabled={!!busy}
                    onClick={() =>
                      perform("Reading live agreement", async () => {
                        const r = await readAgreement(deployment, c.id);
                        if (!r) throw Error("Reference agreement not found");
                        hydrate(r);
                        setNote(
                          "Loaded directly from the deployed contract. Create a new agreement to run your own case.",
                        );
                      })
                    }
                  >
                    <span>{c.title}</span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
                <p>
                  Examples use the real public Example Domain page. Replace the
                  URL and criteria for your own agreement.
                </p>
              </div>
              <a
                className="source-download"
                href={`${import.meta.env.BASE_URL}veridict_escrow.py`}
                download
              >
                <FileCode2 size={16} /> Download contract{" "}
                <ArrowUpRight size={14} />
              </a>
            </aside>
            <div className="agreement-panel">
              <div className="panel-top">
                <div>
                  <span className="eyebrow muted">AGREEMENT FILE</span>
                  <h3>
                    {record ? "Immutable agreement" : "Compose an agreement"}
                  </h3>
                </div>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => fresh()}
                >
                  New <Plus size={14} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  perform("Creating agreement", async () => {
                    if (!address)
                      throw Error(
                        "Choose a test account or connect a wallet first",
                      );
                    if (!Number.isInteger(amount) || amount < 1 || amount > 1e9)
                      throw Error(
                        "Nominal amount must be a whole number between 1 and 1,000,000,000",
                      );
                    if (total !== 10000)
                      throw Error("Criterion weights must add up to 100%");
                    sessionStorage.setItem("veridict-last-id", id);
                    await write("create_agreement", [
                      id,
                      address,
                      clause,
                      url,
                      mode,
                      amount,
                      JSON.stringify(criteria),
                    ]);
                    setNote(
                      "Agreement created on-chain. Submit the claimant statement to start independent adjudication.",
                    );
                  });
                }}
              >
                <fieldset disabled={locked}>
                  <div className="input-row">
                    <label className="grow">
                      Agreement ID
                      <input
                        required
                        value={id}
                        minLength={3}
                        maxLength={64}
                        pattern="[A-Za-z0-9_-]+"
                        onChange={(e) => setId(e.target.value)}
                      />
                    </label>
                    <label className="amount-input">
                      Nominal amount · TEST
                      <input
                        required
                        type="number"
                        min="1"
                        max="1000000000"
                        step="1"
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <label>
                    Natural-language agreement
                    <textarea
                      required
                      minLength={20}
                      maxLength={1600}
                      value={clause}
                      onChange={(e) => setClause(e.target.value)}
                      rows={3}
                    />
                  </label>
                  <label>
                    Public evidence URL
                    <div className="input-icon">
                      <Link2 size={14} />
                      <input
                        required
                        type="url"
                        pattern="https://.*"
                        value={url}
                        maxLength={500}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                  </label>
                  <div className="criteria-heading">
                    <span className="field-label">Acceptance criteria</span>
                    <span className={total === 10000 ? "mint" : "rose"}>
                      {total / 100}% / 100%
                    </span>
                  </div>
                  <div className="criteria-list">
                    {criteria.map((c, i) => (
                      <div className="criterion" key={i}>
                        <span className="criterion-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <textarea
                          aria-label={`Criterion ${i + 1}`}
                          required
                          minLength={12}
                          maxLength={500}
                          rows={2}
                          value={c.text}
                          onChange={(e) =>
                            setCriteria((prev) =>
                              prev.map((r, j) =>
                                j === i ? { ...r, text: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        <label className="weight">
                          <input
                            aria-label={`Criterion ${i + 1} weight in percent`}
                            required
                            type="number"
                            min=".01"
                            max="100"
                            step=".01"
                            value={c.weight_bps / 100}
                            onChange={(e) =>
                              setCriteria((prev) =>
                                prev.map((r, j) =>
                                  j === i
                                    ? {
                                        ...r,
                                        weight_bps: Math.round(
                                          Number(e.target.value) * 100,
                                        ),
                                      }
                                    : r,
                                ),
                              )
                            }
                          />
                          <span>%</span>
                        </label>
                        {criteria.length > 1 && (
                          <button
                            type="button"
                            className="remove-criterion"
                            aria-label={`Remove criterion ${i + 1}`}
                            onClick={() =>
                              setCriteria((p) => p.filter((_, j) => j !== i))
                            }
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="criteria-controls">
                    <button
                      type="button"
                      className="text-button"
                      disabled={criteria.length >= 6}
                      onClick={() =>
                        setCriteria((p) => [
                          ...p,
                          {
                            id: `c-${randomId().slice(0, 6)}`,
                            text: "",
                            weight_bps: 1000,
                          },
                        ])
                      }
                    >
                      <Plus size={12} /> Add criterion
                    </button>
                    <span>WEIGHTED / SOURCE-BOUND / MAX 6</span>
                  </div>
                  <label>
                    Verification method
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as typeof mode)}
                    >
                      <option value="independent">
                        Independent assessment + exact decision matching
                      </option>
                      <option value="audited">
                        Independent assessment + source-grounded reasoning audit
                      </option>
                    </select>
                  </label>
                </fieldset>
                {!record && (
                  <button
                    className="primary full"
                    disabled={
                      !!busy ||
                      !deployment ||
                      sourceStatus !== "verified" ||
                      !address ||
                      total !== 10000
                    }
                    type="submit"
                  >
                    {busy === "Creating agreement" ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    Create agreement on Studionet <ArrowRight size={16} />
                  </button>
                )}
              </form>
              <div className="claim-section">
                <label>
                  Claimant statement
                  <textarea
                    value={claim}
                    minLength={10}
                    maxLength={1600}
                    rows={3}
                    disabled={!!busy || (!!record && !canJudge)}
                    onChange={(e) => setClaim(e.target.value)}
                  />
                </label>
                <button
                  className="primary full"
                  disabled={
                    !!busy ||
                    !canJudge ||
                    sourceStatus !== "verified" ||
                    claim.trim().length < 10
                  }
                  onClick={() =>
                    perform("Adjudicating evidence", async () => {
                      await write("adjudicate_claim", [id, claim]);
                      setTab("findings");
                      setNote(
                        "Consensus accepted. The results below were read directly from contract state.",
                      );
                    })
                  }
                >
                  {busy === "Adjudicating evidence" ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Scale size={17} />
                  )}
                  Adjudicate claim <ArrowUpRight size={16} />
                </button>
                <p className="hint">
                  {record && !isParty
                    ? "Only the agreement creator or beneficiary can adjudicate or request review."
                    : !address
                      ? "Create a free Studio test account to enable on-chain actions."
                      : "No personal wallet funds required. Consensus may take several minutes."}
                </p>
              </div>
              <div className="lookup">
                <label htmlFor="lookup-id">Open an existing agreement</label>
                <div>
                  <input
                    id="lookup-id"
                    aria-label="Existing agreement ID"
                    placeholder="VRD-…"
                    disabled={!!busy}
                    value={id}
                    onChange={(e) => {
                      setId(e.target.value);
                      setRecord(null);
                    }}
                  />
                  <button
                    className="secondary"
                    disabled={!!busy || !deployment || !id}
                    onClick={() =>
                      perform("Reading agreement", async () => {
                        const r = await readAgreement(deployment!, id);
                        if (!r) throw Error("No agreement exists with this ID");
                        hydrate(r);
                      })
                    }
                  >
                    <RefreshCw size={14} /> Read
                  </button>
                </div>
              </div>
            </div>
            <div className="decision-panel">
              <div className="panel-top">
                <div>
                  <span className="eyebrow muted">THE DECISION</span>
                  <h3>Evidence speaks.</h3>
                </div>
                <span
                  className={`state-tag ${record?.status === "REVIEW_REQUIRED" ? "unknown" : ""}`}
                >
                  {record?.status?.replace(/_/g, " ") || "AWAITING AGREEMENT"}
                </span>
              </div>
              <div className="progress-track">
                {["Agreement", "Evidence", "Consensus", "Decision"].map(
                  (s, i) => (
                    <div
                      key={s}
                      className={
                        (i === 0 && record) || (i > 0 && completed)
                          ? "complete"
                          : ""
                      }
                    >
                      <span>
                        {(i === 0 && record) || (i > 0 && completed) ? (
                          <Check size={12} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <small>{s}</small>
                    </div>
                  ),
                )}
              </div>
              {busy && (
                <div className="pending" role="status">
                  <Loader2 className="spin" size={16} />
                  <div>
                    {busy}
                    <small>
                      {currentTx
                        ? `${currentTx.status} · ${short(currentTx.hash)}`
                        : "Waiting for the network…"}
                    </small>
                  </div>
                </div>
              )}
              {completed ? (
                <>
                  <div className={`verdict ${verdictColor}`}>
                    <span className="eyebrow">
                      {record.verdict?.replace(/_/g, " ")}
                    </span>
                    <div className="verdict-ratio">
                      {record.payout_ratio_bps / 100}
                      <span>%</span>
                    </div>
                    <p>
                      {record.status === "REVIEW_REQUIRED"
                        ? "Required proof is missing. The full nominal payout is held."
                        : `${(record.nominal_payout || 0).toLocaleString()} / ${record.escrow_amount.toLocaleString()} TEST nominal allocation`}
                    </p>
                    <div className="ratio-track">
                      <i
                        style={{ width: `${record.payout_ratio_bps / 100}%` }}
                      />
                    </div>
                    <small>
                      {record.status === "REVIEW_REQUESTED"
                        ? "Previous decision shown · review pending"
                        : "Contract decision · no token transfer"}
                    </small>
                  </div>
                  <div className="result-tabs" role="tablist">
                    {(["findings", "source", "history"] as const).map((t) => (
                      <button
                        role="tab"
                        aria-selected={tab === t}
                        key={t}
                        onClick={() => setTab(t)}
                      >
                        {t === "source"
                          ? "Evidence"
                          : t === "history"
                            ? `History (${record.history.length})`
                            : "Findings"}
                      </button>
                    ))}
                  </div>
                  {tab === "findings" && (
                    <div className="findings">
                      {record.assessment?.findings.map((f, i) => (
                        <article key={f.id}>
                          <div className="finding-top">
                            <span>
                              {String(i + 1).padStart(2, "0")} /{" "}
                              {record.criteria[i].weight_bps / 100}% WEIGHT
                            </span>
                            <b
                              className={`finding-status ${f.status.toLowerCase()}`}
                            >
                              {f.status}
                            </b>
                          </div>
                          <h4>{record.criteria[i].text}</h4>
                          <p>{f.reason}</p>
                          {f.quote ? (
                            <blockquote>“{f.quote}”</blockquote>
                          ) : (
                            <div className="missing-proof">
                              No supporting evidence in the source.
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                  {tab === "source" && (
                    <div className="evidence-view">
                      <a
                        href={record.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open evidence source <ArrowUpRight size={13} />
                      </a>
                      <span className="field-label">
                        COMMITTED SOURCE SNAPSHOT
                      </span>
                      <pre>{record.evidence_snapshot}</pre>
                      <span className="field-label">
                        SHA-256 / UTF-8 SNAPSHOT
                      </span>
                      <code>{record.evidence_sha256}</code>
                      <p className="hint">
                        The hash binds the fetched snapshot. Source accuracy and
                        ownership remain external assumptions.
                      </p>
                    </div>
                  )}
                  {tab === "history" && (
                    <div className="history-list">
                      {record.history.map((h) => (
                        <article key={h.revision}>
                          <span>REVISION {h.revision}</span>
                          <h4>{h.verdict.replace(/_/g, " ")}</h4>
                          <p>
                            {h.payout_ratio_bps / 100}% nominal allocation ·{" "}
                            {h.status.replace(/_/g, " ")}
                          </p>
                          <code>{h.evidence_sha256}</code>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="decision-actions">
                    <button
                      className="secondary"
                      onClick={() =>
                        saveJson(`${record.id}.json`, {
                          network: "GenLayer Stable Studionet",
                          chainId: 61999,
                          contractAddress: deployment?.contractAddress,
                          sourceSha256: deployment?.sourceSha256,
                          record,
                          transactions: activeLedger,
                          readAt: new Date().toISOString(),
                          stateVariant: "latest-nonfinal",
                        })
                      }
                    >
                      <Download size={14} /> Export decision
                    </button>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        perform("Refreshing decision", async () => {
                          const r = await readAgreement(deployment!, id);
                          if (r) hydrate(r);
                          else throw Error("Agreement not found");
                          await Promise.all(
                            activeLedger.map(async (tx) => {
                              const status = await transactionStatus(tx.hash);
                              txUpdate({ ...tx, status });
                            }),
                          );
                        })
                      }
                    >
                      <RefreshCw size={13} /> Refresh
                    </button>
                  </div>
                  {isParty &&
                    record.review_count < 1 &&
                    ["FINALIZED", "REVIEW_REQUIRED"].includes(
                      record.status,
                    ) && (
                      <details className="review-box">
                        <summary>
                          Request one evidence review <ChevronRight size={13} />
                        </summary>
                        <label>
                          Reason for review
                          <textarea
                            rows={3}
                            value={reason}
                            disabled={!!busy}
                            maxLength={1000}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <button
                          className="secondary full"
                          disabled={!!busy || reason.trim().length < 20}
                          onClick={() =>
                            perform("Requesting review", async () => {
                              await write("request_review", [id, reason]);
                              setNote(
                                "Review requested. Use Adjudicate claim to fetch and assess the source again. Prior findings remain in history.",
                              );
                            })
                          }
                        >
                          Request review on-chain
                        </button>
                        <p className="hint">
                          Application-level reassessment, once per agreement.
                          This does not alter network validator membership or
                          slash stake.
                        </p>
                      </details>
                    )}
                </>
              ) : (
                <div className="empty-decision">
                  <div className="empty-sigil">
                    <Scale size={38} strokeWidth={1} />
                  </div>
                  <h4>No verdict without evidence.</h4>
                  <p>
                    Create an agreement, then submit a claim.
                    <br />
                    Or read a verified example to inspect a real decision.
                  </p>
                  <div className="empty-key">
                    <span>PASS</span>
                    <span>FAIL</span>
                    <span>UNKNOWN</span>
                  </div>
                  <p className="empty-small">
                    Unknown evidence holds the entire allocation.
                    <br />A claimant's statement is never treated as proof.
                  </p>
                </div>
              )}
              <div className="tx-list">
                <div className="panel-label">
                  TRANSACTION JOURNAL <span>{activeLedger.length}</span>
                </div>
                {activeLedger.length ? (
                  activeLedger.map((t) => (
                    <a
                      key={t.hash}
                      href={explorerTx(t.hash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div>
                        <b>{t.action.replace(/_/g, " ")}</b>
                        <code>{short(t.hash)}</code>
                      </div>
                      <span>
                        {t.status}
                        <ArrowUpRight size={11} />
                      </span>
                    </a>
                  ))
                ) : (
                  <p>Real transaction hashes appear here after submission.</p>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="protocol-section" id="protocol">
          <div className="section-heading">
            <div>
              <div className="eyebrow muted">02 / HOW TRUST IS BUILT</div>
              <h2>
                A claim is a beginning.
                <br />
                <em>Evidence is the standard.</em>
              </h2>
            </div>
            <p>
              The application never invents a validator vote.
              <br />
              The network runs the decision; the interface reads it.
            </p>
          </div>
          <div className="protocol-cards">
            {[
              {
                icon: <Layers3 />,
                n: "01",
                title: "Agree on the conditions.",
                text: "Define an immutable agreement, a public HTTPS evidence source and weighted acceptance criteria. The weights must total 100%.",
              },
              {
                icon: <Fingerprint />,
                n: "02",
                title: "Commit the actual evidence.",
                text: "GenVM fetches the source independently. Strict equivalence commits the same snapshot, and SHA-256 binds the record to its exact content.",
              },
              {
                icon: <ShieldCheck />,
                n: "03",
                title: "Verify before deciding.",
                text: "Validators independently assess each criterion and must match the decision vector. Audited mode additionally checks source-grounded reasoning.",
              },
            ].map((c) => (
              <article key={c.n}>
                <div>
                  {c.icon}
                  <span>{c.n}</span>
                </div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
          <div className="protocol-note">
            <span>THE SETTLEMENT RULE</span>
            <p>
              All evidence known → sum the weights of passed criteria.
              <br />
              Any required evidence unknown → hold the entire nominal allocation
              for review.
            </p>
            <span>
              DETERMINISTIC MATH.
              <br />
              INDEPENDENT JUDGMENT.
            </span>
          </div>
        </section>
        <section className="deployment-section">
          <div>
            <div className="eyebrow muted">03 / VERIFIABLE BY DESIGN</div>
            <h2>Inspect the record.</h2>
            <p>
              Source, deployment, evidence and decisions.
              <br />
              Everything needed to follow the chain of reasoning.
            </p>
          </div>
          <div className="deployment-links">
            {deployment && (
              <>
                <a
                  href={explorerContract(deployment.contractAddress)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    DEPLOYED CONTRACT<code>{deployment.contractAddress}</code>
                  </span>
                  <ArrowUpRight size={18} />
                </a>
                <a
                  href={explorerTx(deployment.transactions.deploy)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    DEPLOYMENT TRANSACTION
                    <code>{short(deployment.transactions.deploy)}</code>
                  </span>
                  <ArrowUpRight size={18} />
                </a>
              </>
            )}
            <a
              href={`${import.meta.env.BASE_URL}deployment.json`}
              target="_blank"
              rel="noreferrer"
            >
              <span>
                PUBLIC EXECUTION RECORD
                <small>
                  Transactions, source digest and observed on-chain states
                </small>
              </span>
              <ArrowUpRight size={18} />
            </a>
          </div>
        </section>
      </main>
      <footer>
        <a className="brand" href="#">
          <span className="brand-icon">
            V<span>·</span>
          </span>
          <span>
            VERIDICT<small>EVIDENCE BEFORE OUTCOME.</small>
          </span>
        </a>
        <span>
          GENLAYER STABLE STUDIONET / 61999
          <br />
          Test-network adjudication · nominal units · no token custody
        </span>
        <a
          href="https://github.com/halihalibt/veridict-genlayer-protocol"
          target="_blank"
          rel="noreferrer"
        >
          Open source <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
