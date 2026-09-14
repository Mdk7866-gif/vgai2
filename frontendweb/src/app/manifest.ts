import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "vgAI2",
    short_name: "vgAI2",
    description: "AI video creation studio for editable scene-by-scene assets.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6d28d9",
  };
}
