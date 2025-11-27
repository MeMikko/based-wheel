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
          display: "flex",
          background: "linear-gradient(135deg, #7e22ce, #ec4899)",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 72,
          color: "white",
          fontWeight: "bold",
          padding: "50px",
          textAlign: "center"
        }}
      >
        {text}
      </div>
    ),
    {
      width: 1200,
      height: 630
    }
  );
}
