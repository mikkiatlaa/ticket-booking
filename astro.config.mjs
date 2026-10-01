// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import { loadEnv } from "vite";

// `astro dev` reads .env but does not put it in process.env, which is where
// src/lib looks. Copy it over for local work. On Vercel the real environment
// variables are already there, and existing values are never overwritten.
for (const [key, value] of Object.entries(loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""))) {
  process.env[key] ??= value;
}

// Every page is rendered on the server when requested: ticket counts and
// guest lists must always be live, never a cached copy.
export default defineConfig({
  output: "server",
  adapter: vercel(),
});
