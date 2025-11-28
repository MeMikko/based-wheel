import { NextResponse } from "next/server";
import { JsonRpcProvider, Contract } from "ethers";

export const dynamic = "force-dynamic";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC!;

const ABI = [
  "event SpinResult(address indexed player, bool indexed isFree, uint8 tier, uint256 amountWei, string message)"
];

export async function GET() {
  const provider = new JsonRpcProvider(BASE_RPC);

  const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

  // Load events
  const logs = await provider.getLogs({
    address: CONTRACT_ADDRESS,
    fromBlock: 0,
    toBlock: "latest",
  });

  const wins: { player: string; amount: string; tier: number }[] = [];

  for (const log of logs.reverse()) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed.name === "SpinResult") {
        const tier = Number(parsed.args.tier);
        const amount = parsed.args.amountWei.toString();
        const player = parsed.args.player;

        if (tier > 0) {
          wins.push({
            player,
            amount,
            tier,
          });
        }
      }
    } catch {}
  }

  const top10 = wins.slice(0, 10);

  const frame = {
    version: "vNext",
    image: `${process.env.NEXT_PUBLIC_BASE_URL}/api/frame/leaderboard/image`,
    text: "Top Winners",
    buttons: [
      { label: "Back", action: "post", target: "/api/frame" }
    ]
  };

  return NextResponse.json(frame);
}