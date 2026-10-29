export const GENLAYER_STUDIONET_CONFIG = {
  networkName: "GenLayer Stable Studionet",
  chainIdDecimal: 61999,
  chainIdHex: "0xf22f",
  rpcUrl: "https://studio.genlayer.com/api",
  explorerUrl: "https://explorer-studio.genlayer.com",
} as const;
export interface RpcProbeResult {
  reachable: boolean;
  latencyMs: number;
  chainIdHex: string | null;
  error?: string;
}
export async function probeStudionetRpc(): Promise<RpcProbeResult> {
  const start = performance.now();
  try {
    const r = await fetch(GENLAYER_STUDIONET_CONFIG.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error(`RPC HTTP ${r.status}`);
    const data = await r.json();
    if (data.error) throw Error(data.error.message);
    const valid =
      typeof data.result === "string" &&
      Number.parseInt(data.result, 16) === 61999;
    return {
      reachable: valid,
      latencyMs: Math.round(performance.now() - start),
      chainIdHex: data.result ?? null,
      ...(!valid ? { error: "Unexpected chain ID" } : {}),
    };
  } catch (e) {
    return {
      reachable: false,
      latencyMs: Math.round(performance.now() - start),
      chainIdHex: null,
      error: e instanceof Error ? e.message : "Network unavailable",
    };
  }
}
