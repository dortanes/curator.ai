import { Config } from "@stencil/core";
import { postcss } from "@stencil-community/postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export const config: Config = {
  namespace: "curator-ui",
  globalStyle: "src/global/app.css",
  plugins: [
    postcss({
      plugins: [tailwindcss(), autoprefixer()]
    })
  ],
  env: {
    BACKEND_PORT: process.env.PORT || "1532",
  },
  outputTargets: [
    {
      type: "www",
      serviceWorker: null,
      baseUrl: "http://localhost:3333",
    },
  ],
  devServer: {
    port: 3333,
    address: "0.0.0.0",
    reloadStrategy: "hmr",
  },
};
