import { expect, test } from "vitest";

import { preserveSetCookieHeaders } from "#/lib/auth-cookies.ts";

test("preserveSetCookieHeaders keeps every Set-Cookie on a 302", () => {
	const headers = new Headers();
	headers.append("set-cookie", "better-auth.session_token=session; Path=/");
	headers.append("set-cookie", "better-auth.session_data=data; Path=/");
	headers.append("set-cookie", "better-auth.account_data=account; Path=/");
	headers.set("location", "/");
	const preserved = preserveSetCookieHeaders(
		new Response(undefined, { headers, status: 302 }),
	);
	expect(preserved.status).toBe(302);
	expect(preserved.headers.get("location")).toBe("/");
	expect(preserved.headers.getSetCookie()).toEqual([
		"better-auth.session_token=session; Path=/",
		"better-auth.session_data=data; Path=/",
		"better-auth.account_data=account; Path=/",
	]);
});

test("preserveSetCookieHeaders leaves a single cookie Response as-is", () => {
	const response = new Response(undefined, {
		headers: { "set-cookie": "better-auth.session_token=session; Path=/" },
		status: 302,
	});
	expect(preserveSetCookieHeaders(response)).toBe(response);
});

test("preserveSetCookieHeaders recovers cookies joined on one Set-Cookie header", () => {
	const headers = new Headers();
	headers.set(
		"set-cookie",
		"better-auth.session_token=session; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT, better-auth.account_data=account; Path=/",
	);
	headers.set("location", "/");
	const preserved = preserveSetCookieHeaders(
		new Response(undefined, { headers, status: 302 }),
	);
	expect(preserved.status).toBe(302);
	expect(preserved.headers.get("location")).toBe("/");
	expect(preserved.headers.getSetCookie()).toEqual([
		"better-auth.session_token=session; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT",
		"better-auth.account_data=account; Path=/",
	]);
});
