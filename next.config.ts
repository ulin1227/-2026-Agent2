import type { NextConfig } from "next";

// Paths used by the former standalone rag-service app now live under the role portals.
const legacyRoutes: Array<[string, string]> = [
  ["/project-map", "/onboarding/project-map"],
  ["/onboarding-roadmap", "/onboarding/roadmap"],
  ["/risk-management", "/onboarding/risk-knowledge"],
  ["/assistant", "/onboarding/chat"],
  ["/chat", "/onboarding/chat"],
  ["/admin/conversations", "/supervisor/conversations"],
];

const nextConfig: NextConfig = {
  async redirects() {
    return legacyRoutes.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
};

export default nextConfig;
