/**
 * Typed stand-in for a dependency the code under test must never touch —
 * every member access throws with the offending property name.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T names the stub's assumed interface at the call site
function unusedDependency<T extends object>(subject: string): T {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- proxy target is never used as T; every access traps and throws
	const target = {} as T;
	return new Proxy(target, {
		get(_target, property) {
			throw new Error(`${subject}.${String(property)} must not be used`);
		},
	});
}

export { unusedDependency };
