import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Procedural favicon: a single warm mote on the ground colour. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0a09", borderRadius: 14 }}>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: "radial-gradient(circle, #efe7d9 0%, #efe7d9 45%, rgba(239,231,217,0) 100%)" }} />
      </div>
    ),
    size,
  );
}
