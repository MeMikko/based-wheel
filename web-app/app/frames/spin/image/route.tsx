import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "black",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          color: "white",
          fontSize: 60,
          fontWeight: "bold"
        }}
      >
        <div>🌀 BASED WHEEL</div>
        <div style={{ fontSize: 40, opacity: 0.7 }}>Spin to win ETH</div>
        <div
          style={{
            marginTop: 40,
            background: "#FFD700",
            padding: "20px 45px",
            borderRadius: 20,
            color: "black"
          }}
        >
          SPIN NOW
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630
    }
  );
}
