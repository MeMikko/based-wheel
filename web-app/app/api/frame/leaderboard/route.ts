import { NextResponse } from "next/server";
import { BrowserProvider, Contract, formatEther } from "ethers";

export const dynamic = "force-dynamic";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC!;

const ABI = [
  "event SpinResult(address indexed player, bool indexed isFree, uint8 tier, uint256 amountWei, string message)"
];

export async function GET() {
  const provider = new BrowserProvider(new (class { })(), BASE_RPC);
  const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

  const logs = await provider.getLogs({
    address: CONTRACT_ADDRESS,
    fromBlock: 0,
    toBlock: "latest"
  });

  const wins: { player: string; amount: number }[] = [];

  for (const log of logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed.name !== "SpinResult") continue;
      const amt = Number(formatEther(parsed.args.amountWei));
      if (amt > 0) {
        wins.push({ player: parsed.args.player, amount: amt });
      }
    } catch {}
  }

  const top = wins.sort((a, b) => b.amount - a.amount).slice(0, 5);

  let text = "Top Winners\n\n";
  top.forEach((w, i) => {
    const short = w.player.slice(0, 6) + "..." + w.player.slice(-4);
    text += `${i+1}. ${short} — ${w.amount} ETH\n`;
  });

  const frame = {
    version: "vNext",
    image: `${process.env.NEXT_PUBLIC_BASE_URL}/opengraph-image?text=${encodeURIComponent(text)}`,
    buttons: [
      { label: "Back", action: "post", target: "/api/frame" },
      { label: "Spin", action: "post", target: "/api/frame/spin" }
    ]
  };

  return NextResponse.json(frame);
}
