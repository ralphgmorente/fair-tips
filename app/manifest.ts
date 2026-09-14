import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id keeps an installed copy attached to this app even if the start
    // url ever moves.
    id: "/",
    name: "ShiftFlow — Tip Distribution",
    short_name: "ShiftFlow",
    description:
      "Split Clover tips between the staff who were clocked in when each order came in.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f7c67",
    theme_color: "#0f7c67",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    // Long-pressing the installed icon jumps straight to a tab, the way a native
    // app's quick actions do.
    shortcuts: [
      {
        name: "Tips",
        short_name: "Tips",
        description: "The payout split for the current period",
        url: "/tips",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "My tips",
        short_name: "My tips",
        description: "What you are owed",
        url: "/my-tips",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "History",
        short_name: "History",
        description: "Periods already published to staff",
        url: "/history",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }]
      }
    ]
  };
}
