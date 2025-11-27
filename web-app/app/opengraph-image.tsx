import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text") || "BASED WHEEL";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "40px",
          fontSize: 70,
          fontWeight: 900,
          color: "white",
          textShadow: "0 8px 30px rgba(0,0,0,0.4)",
        }}
      >
        {text}
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
