import { defineConfig } from "vite";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  resolve: {
    alias: [
      {
        find: "@lsflight/sim",
        replacement: new URL("../sim/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@lsflight/input",
        replacement: new URL("../input/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@lsflight/render",
        replacement: new URL("../render/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
});
