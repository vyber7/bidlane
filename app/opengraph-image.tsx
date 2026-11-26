import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The link preview for every page that doesn't set its own image. Listing
// pages replace it with a crop of the car's photo (see listing-metadata).
// It mirrors the home page hero: slate-950, an amber glow, and the header's mark.

export const alt = "BidLane: enthusiast car auctions. Great cars. Worth the chase.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image renderer reads TTF, not the woff2 next/font serves, so Inter ships
// as files (SIL Open Font License, see assets/fonts/OFL.txt).
const [interRegular, interBlack] = await Promise.all([
  readFile(join(process.cwd(), "assets/fonts/Inter-400.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Inter-900.ttf")),
]);

const colors = { slate950: "#020617", slate300: "#cbd5e1", amber400: "#fbbf24", white: "#ffffff" };

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: colors.slate950,
          backgroundImage: "radial-gradient(circle at 88% 12%, rgba(245, 158, 11, 0.42), rgba(245, 158, 11, 0.12) 32%, transparent 62%)",
          color: colors.white,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 24,
              backgroundColor: colors.amber400,
              color: colors.slate950,
              fontSize: 52,
              fontWeight: 900,
            }}
          >
            B
          </div>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 900, letterSpacing: "-0.02em" }}>
            Bid<span style={{ color: colors.amber400 }}>Lane</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, color: colors.amber400, fontSize: 26, fontWeight: 900, letterSpacing: "0.22em" }}>
            <div style={{ width: 56, height: 3, backgroundColor: colors.amber400 }} />
            ENTHUSIAST CAR AUCTIONS
          </div>
          {/* Two set lines rather than a wrap that strands "chase." */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 92, fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.035em" }}>
            <span>Great cars.</span>
            <span>Worth the chase.</span>
          </div>
          <div style={{ marginTop: 28, maxWidth: 820, fontSize: 32, lineHeight: 1.4, color: colors.slate300 }}>
            Discover enthusiast cars, follow the bidding, and make your next great drive yours.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: interRegular, style: "normal", weight: 400 },
        { name: "Inter", data: interBlack, style: "normal", weight: 900 },
      ],
    },
  );
}
