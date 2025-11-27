import { NextResponse } from "next/server";
import { BrowserProvider, Contract } from "ethers";

export const dynamic = "force-dynamic";

const ABI = [
  "function lastSpinRNG(address) view returns (uint256)",
  "function getPoolBalance() view returns (uint256)"
];

function offchainSpin() {
  const r = Math.random() * 100;
  if (r < 95) return { text: "Based!", wei: 0 };
  if (r < 99) return { text: "0.001 ETH", wei: 1e15 };
  if (r < 99.9) return { text: "0.01 ETH", wei: 1e16 };
  if (r < 99.99) return { text: "0.05 ETH", wei: 5e16 };
  return { text: "JACKPOT!!!", wei: -1 };
}

async function onchainSpin(address: string) {
  const provider = new BrowserProvider(new (class {})(), process.env.NEXT_PUBLIC_BASE_RPC!);
  const c = new Contract(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!, ABI, provider);

  try {
    const rng = await c.lastSpinRNG(address);
    const value = Number(rng % 10000) / 100;
    const r = value;

    if (r < 95) return { text: "On-chain: TEXT", wei: 0 };
    if (r < 99) return { text: "On-chain 0.001", wei: 1e15 };
    if (r < 99.9) return { text: "On-chain 0.01", wei: 1e16 };
    if (r < 99.99) return { text: "On-chain 0.05", wei: 5e16 };
    return { text: "ON-CHAIN JACKPOT", wei: -1 };

  } catch {
    return offchainSpin();
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const frameUser = body.untrustedData?.fid || "anon";
  const rngMode = body.untrustedData?.inputText === "onchain" ? "onchain" : "offchain";

  let spin;
  if (rngMode === "offchain") spin = offchainSpin();
  else spin = await onchainSpin(frameUser);

  const text = spin.text;

  const frame = {
    version: "vNext",
    image: `${process.env.NEXT_PUBLIC_BASE_URL}/opengraph-image?text=${encodeURIComponent(text)}`,
    buttons: [
      { label: "Cast Result", action: "post_url", target: `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}` },
      { label: "Spin Again", action: "post", target: "/api/frame/spin" },
      { label: "Leaderboard", action: "post", target: "/api/frame/leaderboard" },
      { label: "Jackpot", action: "post", target: "/api/frame/jackpot" }
    ]
  };

  return NextResponse.json(frame);
}
