import type { MetadataRoute } from "next";

const PUBLIC_PAGES = [
  "",
  "/about",
  "/pricing",
  "/terms-and-conditions",
  "/cancellation-refund-policy",
  "/privacy-policy",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.map((path) => ({
    url: `https://vgai2.com${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
