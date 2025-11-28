import { NextResponse } from "next/server";
import { JsonRpcProvider, Contract } from "ethers";

export const dynamic = "force-dynamic";

const RPC = process.env.NEXT_PUBLIC_BASE_RPC!;
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;

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
  try {
    const provider = new JsonRpcProvider(RPC);
    const c = new Contract(CONTRACT_ADDRESS, ABI, provider);

    const rng = await c.lastSpinRNG(address);
    const value = Number(rng % 10000n) / 100; // 0–100.00 range

    if (value < 95) return { text: "On-chain: TEXT", wei: 0 };
    if (value < 99) return { text: "On-chain 0.001", wei: 1e15 };
    if (value < 99.9) return { text: "On-chain 0.01", wei: 1e16 };
    if (value < 99.99) return { text: "On-chain 0.05", wei: 5e16 };

    return { text: "ON-CHAIN JACKPOT", wei: -1 };
  } catch (err) {
    console.error("On-chain RNG failed, using offchain fallback:", err);
    return offchainSpin();
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const frameUser = body.untrustedData?.fid || "anon";

  const onchain =
    body.untrustedData?.inputText &&
    body.untrustedData.inputText.toLowerCase() === "onchain";

  const spinResult = onchain
    ? await onchainSpin(frameUser.toString())
    : offchainSpin();

  const text = spinResult.text;

  const frame = {
    version: "vNext",
    image: `${process.env.NEXT_PUBLIC_BASE_URL}/opengraph-image?text=${encodeURIComponent(
      text
    )}`,
    buttons: [
      {
        label: "Cast Result",
        action: "post_url",
        target: `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`
      },
      { label: "Spin Again", action: "post", target: "/api/frame/spin" },
      { label: "Leaderboard", action: "post", target: "/api/frame/leaderboard" },
      { label: "Jackpot", action: "post", target: "/api/frame/jackpot" }
    ]
  };

  return NextResponse.json(frame);
}