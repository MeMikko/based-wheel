import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text") || "Based Wheel";

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 48,
          color: "white",
          background: "linear-gradient(135deg,#6b0fff,#ff008c)",
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "40px",
          textAlign: "center",
        }}
      >
        {text}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}

export default function OGImageRoute() {
  return null;
}
