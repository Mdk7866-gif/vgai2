import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/project_folder/", "/profile", "/characters", "/style_templates", "/generate_script", "/liked_projects", "/login"],
    },
    sitemap: "https://vgai2.com/sitemap.xml",
  };
}
