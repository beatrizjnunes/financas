import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // A página "Casal" passou a chamar-se "Partilhado".
  redirects: async () => [{ source: "/casal", destination: "/partilhado", permanent: true }],
};

export default nextConfig;
