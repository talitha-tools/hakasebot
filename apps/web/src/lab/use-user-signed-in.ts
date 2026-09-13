import { useQuery } from "@tanstack/react-query";

import { authClient } from "#/lib/auth-client";
import type { DevUserPublic } from "#/lib/dev-user.ts";

import { readDevUserPublicFn } from "./dev-user-rpc.ts";

export function useUserSignedIn(): {
	dev: DevUserPublic;
	isPending: boolean;
	oauthName: string | undefined;
	signedIn: boolean;
} {
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const query = useQuery({
		queryFn: async () => readDevUserPublicFn(),
		queryKey: ["dev-user"],
		staleTime: Number.POSITIVE_INFINITY,
	});
	const dev: DevUserPublic = query.data ?? { kind: "off" };
	const oauthName =
		session?.user === undefined ? undefined : (session.user.name ?? "you");
	const signedIn = oauthName !== undefined || dev.kind === "on";
	const isPending = !signedIn && (sessionPending || query.isPending);
	return { dev, isPending, oauthName, signedIn };
}
