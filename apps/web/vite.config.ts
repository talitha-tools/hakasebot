import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	plugins: [
		devtools(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		paraglideVitePlugin({
			outdir: "./src/paraglide",
			outputStructure: "message-modules",
			project: "./project.inlang",
			strategy: ["baseLocale"],
			emitTsDeclarations: true,
		}),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	resolve: { tsconfigPaths: true },
});

export default config;
