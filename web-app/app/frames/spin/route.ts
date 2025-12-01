import { FrameResponse } from "frames.js";

export const runtime = "edge";

export async function POST() {
  return FrameResponse.navigate({
    redirect: "https://based-app-psi.vercel.app/app"
  });
}
