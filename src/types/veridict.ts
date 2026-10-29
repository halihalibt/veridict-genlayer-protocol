export type Criterion = { id: string; text: string; weight_bps: number };
export type Finding = {
  id: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  quote: string;
  reason: string;
};
export type Assessment = { findings: Finding[] };
export interface Agreement {
  protocol: string;
  id: string;
  creator: string;
  beneficiary: string;
  clause: string;
  evidence_url: string;
  equivalence_mode: "independent" | "audited";
  escrow_amount: number;
  unit: string;
  criteria: Criterion[];
  status: "ACTIVE" | "FINALIZED" | "REVIEW_REQUIRED" | "REVIEW_REQUESTED";
  revision: number;
  review_count: number;
  verdict: string | null;
  payout_ratio_bps: number;
  nominal_payout?: number;
  assessment?: Assessment;
  evidence_snapshot?: string;
  evidence_sha256?: string;
  claimant_statement?: string;
  history: {
    revision: number;
    evidence_sha256: string;
    assessment: Assessment;
    status: string;
    verdict: string;
    payout_ratio_bps: number;
  }[];
}
export interface Deployment {
  contractAddress: `0x${string}`;
  chainId: number;
  sourceSha256: string;
  deployer: string;
  transactions: Record<string, `0x${string}`>;
  verification: string;
  verifiedAt?: string;
  cases: { id: string; title: string; state: Agreement }[];
}
export type TxEntry = {
  hash: `0x${string}`;
  action: string;
  status: string;
  agreementId: string;
};
