import { NextResponse } from "next/server";

export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    frames: [
      {
        version: "vNext",
        image: `${process.env.NEXT_PUBLIC_BASE_URL}/frames/image`,
        buttons: [
          {
            label: "Spin the Wheel 🎡",
            action: "post",
            target: `${process.env.NEXT_PUBLIC_BASE_URL}/frames/spin`,
          },
        ],
        ogTitle: "Based Wheel – Spin Now",
        ogDescription: "1 free spin/day. Win ETH or motivational vibes.",
      },
    ],
  });
}
