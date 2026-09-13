export const FAKE_SESSION_COOKIE = "better-auth.session_token=fake";
export const FAKE_ACCOUNT_COOKIE = "better-auth.account_data=sealed";

export function betterAuthApiError(args: {
	status: string;
	statusCode: number;
}): Error {
	const error = new Error("APIError");
	error.message = "";
	error.name = "APIError";
	return Object.assign(error, args);
}
