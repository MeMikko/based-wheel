import { ImageResponse } from "next/og";
import { JsonRpcProvider, Contract, formatEther } from "ethers";

export const size = {
  width: 1200,
  height: 630,
};

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const BASE_RPC = process.env.NEXT_PUBLIC_BASE_RPC!;
const CONTRACT_ABI = [
  "function getPoolBalance() view returns (uint256)"
];

export const contentType = "image/png";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  let text = "Spin the Based Wheel";
  let subtitle = "Win ETH or motivational wisdom";

  // optional: change text when clicking frame
  if (action === "spin") {
    text = "Connect wallet to spin";
    subtitle = "1 free spin/day";
  }

  // Load pool amount
  let pool = "Loading...";
  try {
    const provider = new JsonRpcProvider(BASE_RPC);
    const c = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const bal = await c.getPoolBalance();
    pool = Number(formatEther(bal)).toFixed(4) + " ETH";
  } catch {
    pool = "Unavailable";
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "black",
          color: "white",
          fontSize: 48,
          padding: 40,
        }}
      >
        <div style={{ fontSize: 70, marginBottom: 20 }}>{text}</div>
        <div style={{ fontSize: 40, opacity: 0.8 }}>{subtitle}</div>

        <div
          style={{
            marginTop: 40,
            fontSize: 36,
            background: "#FFD700",
            color: "black",
            padding: "12px 24px",
            borderRadius: 12,
            fontWeight: "bold",
          }}
        >
          Prize Pool: {pool}
        </div>
      </div>
    ),
    size
  );
}
