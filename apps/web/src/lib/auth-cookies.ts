function splitSetCookieHeader(setCookie: string): string[] {
	if (setCookie === "") {
		return [];
	}
	const result: string[] = [];
	let start = 0;
	let index = 0;
	while (index < setCookie.length) {
		if (setCookie[index] === ",") {
			let look = index + 1;
			while (look < setCookie.length && setCookie[look] === " ") {
				look += 1;
			}
			while (
				look < setCookie.length &&
				setCookie[look] !== "=" &&
				setCookie[look] !== ";" &&
				setCookie[look] !== ","
			) {
				look += 1;
			}
			if (look < setCookie.length && setCookie[look] === "=") {
				const part = setCookie.slice(start, index).trim();
				if (part !== "") {
					result.push(part);
				}
				start = index + 1;
				while (start < setCookie.length && setCookie[start] === " ") {
					start += 1;
				}
				index = start;
				continue;
			}
		}
		index += 1;
	}
	const last = setCookie.slice(start).trim();
	if (last !== "") {
		result.push(last);
	}
	return result;
}

function setCookieValues(headers: Headers): string[] {
	const listed = headers.getSetCookie();
	const joined = splitSetCookieHeader(headers.get("set-cookie") ?? "");
	return joined.length > listed.length ? joined : listed;
}

/**
 * Rebuild a Response so every `Set-Cookie` is its own header.
 *
 * Some runtimes collapse `Headers.get("set-cookie")` to the first cookie
 * or join them with commas. GitHub sign-in sets session cookies and the
 * GitHub account cookie together; if the account cookie never lands, Lab
 * looks signed in and then throws session_expired.
 */
export function preserveSetCookieHeaders(response: Response): Response {
	const cookies = setCookieValues(response.headers);
	if (cookies.length <= 1) {
		return response;
	}
	const headers = new Headers();
	for (const [name, value] of response.headers.entries()) {
		if (name.toLowerCase() === "set-cookie") {
			continue;
		}
		headers.append(name, value);
	}
	for (const cookie of cookies) {
		headers.append("set-cookie", cookie);
	}
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}
