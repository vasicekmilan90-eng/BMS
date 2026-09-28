import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

// Výstup jde přímo do integrace, která kartu servíruje na /heating_curve/
export default {
  input: "src/index.ts",
  output: {
    file: "../custom_components/heating_curve/frontend/bms-master-card.js",
    format: "es",
    sourcemap: false,
    inlineDynamicImports: true,
  },
  plugins: [
    resolve({ browser: true }),
    json({ preferConst: true }),
    typescript(),
    terser({ format: { comments: false } }),
  ],
};
