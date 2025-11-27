import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const frame = {
    "version": "vNext",
    "image": `${process.env.NEXT_PUBLIC_BASE_URL}/opengraph-image`,
    "buttons": [
      { "label": "Spin Now", "action": "post", "target": "/api/frame/spin" }
    ]
  };

  return NextResponse.json(frame);
}
