import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { tanStackQueryDevtools } from "#/integrations/tanstack-query/devtools.tsx";
import { getLocale } from "#/paraglide/runtime.js";

import { Footer } from "./footer.tsx";
import { Header } from "./header.tsx";
import { DoodleScatter } from "./ui/doodles.tsx";

export function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang={getLocale()} className="h-full">
			<head>
				<HeadContent />
			</head>
			<body className="flex min-h-dvh flex-col [overflow-wrap:anywhere]">
				<Header />
				<div className="relative flex flex-1 flex-col justify-center">
					<DoodleScatter />
					<div className="relative z-10">{children}</div>
				</div>
				<Footer />
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						tanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
