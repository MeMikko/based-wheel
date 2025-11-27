import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const frame = {
    version: "vNext",
    image: `${process.env.NEXT_PUBLIC_BASE_URL}/opengraph-image`,
    buttons: [
      { label: "Spin", action: "post", target: "/api/frame/spin" },
      { label: "Leaderboard", action: "post", target: "/api/frame/leaderboard" },
      { label: "Jackpot", action: "post", target: "/api/frame/jackpot" },
      { label: "Visit Website", action: "link", target: process.env.NEXT_PUBLIC_BASE_URL }
    ]
  };

  return NextResponse.json(frame);
}
