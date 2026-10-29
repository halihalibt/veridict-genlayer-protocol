import type { Criterion } from "../types/veridict";
export const CASE_SCENARIOS: {
  id: string;
  title: string;
  category: string;
  description: string;
  mode: "independent" | "audited";
  criteria: Criterion[];
}[] = [
  {
    id: "delivery",
    title: "Documentation delivery",
    category: "01 / SOFTWARE DELIVERY",
    description: "Release against clear documentation-use acceptance criteria.",
    mode: "independent",
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
    id: "production",
    title: "Production readiness",
    category: "02 / WEIGHTED SETTLEMENT",
    description:
      "Separate a delivered reference page from an unsupported operational claim.",
    mode: "audited",
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
    id: "audit",
    title: "Missing audit proof",
    category: "03 / EVIDENCE SUFFICIENCY",
    description: "Hold the decision when a required security audit is absent.",
    mode: "independent",
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
