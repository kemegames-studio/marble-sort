import { defineConfig } from "vite";

// Windows 8.3 short paths (used by some launchers to avoid spaces in the
// project path) fail Vite's strict fs allow check because served files
// realpath to the long form. The dev server binds to 127.0.0.1 only, so
// strict serving is safe to relax here.
export default defineConfig({
  server: {
    fs: {
      strict: false,
    },
  },
});
