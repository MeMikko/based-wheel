import { NextResponse } from "next/server";
import { JsonRpcProvider, Contract, formatEther } from "ethers";

export const dynamic = "force-dynamic";

const ABI = ["function getPoolBalance() view returns (uint256)"];

export async function GET() {
  // SERVER-SIDE PROVIDER
  const provider = new JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC!);

  const contract = new Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
    ABI,
    provider
  );

  const bal = await contract.getPoolBalance();
  const eth = Number(formatEther(bal));
  const jackpot = (eth * 0.30).toFixed(4);

  const text = `Jackpot Live\nPool: ${eth} ETH\nJackpot: ${jackpot} ETH`;

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