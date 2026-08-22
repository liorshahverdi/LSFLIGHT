import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.config.*"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["packages/sim/src/**/*.ts"],
    rules: {
      // Architectural guardrail: the sim core depends on nothing else.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["three", "@types/three"],
              message: "packages/sim must not import the renderer.",
            },
            {
              group: ["**/render/**", "**/ui/**", "**/input/**", "**/audio/**"],
              message: "packages/sim must not depend on render/ui/input/audio.",
            },
          ],
        },
      ],
      // Determinism guardrail: no unseeded randomness in the simulation.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use SimRng (seeded) inside packages/sim." },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
);
