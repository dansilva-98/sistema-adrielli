import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/alias": {
        "@": "./src",
      },
      "boundaries/elements": [
        { type: "public-app", pattern: "src/app/\\(public\\)/**" },
        { type: "commerce-app", pattern: "src/app/\\(commerce\\)/**" },
        { type: "content", pattern: "src/modules/content/**" },
        { type: "commerce", pattern: "src/modules/commerce/**" },
        { type: "clinic", pattern: "src/modules/clinic/**" },
        { type: "identity", pattern: "src/modules/identity/**" },
        { type: "audit", pattern: "src/modules/audit/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { types: { anyOf: ["public-app", "commerce-app"] } } },
              disallow: { to: { element: { type: "clinic" } } },
              message: "app/(public) e app/(commerce) não podem importar modules/clinic",
            },
            {
              from: { element: { type: "content" } },
              disallow: { to: { element: { types: { anyOf: ["commerce", "clinic"] } } } },
            },
            {
              from: { element: { type: "commerce" } },
              disallow: { to: { element: { types: { anyOf: ["content", "clinic"] } } } },
            },
            {
              from: { element: { type: "clinic" } },
              disallow: {
                to: { element: { types: { anyOf: ["content", "commerce"] } } },
              },
            },
            {
              from: { element: { type: "identity" } },
              disallow: {
                to: { element: { types: { anyOf: ["content", "commerce", "clinic"] } } },
              },
            },
            {
              from: { element: { type: "audit" } },
              disallow: {
                to: { element: { types: { anyOf: ["content", "commerce", "clinic"] } } },
              },
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
