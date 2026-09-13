/** Facade: GitHub API client split into cohesive modules; import path stays stable. */
export type {
	GithubAppWebhookSettings,
	InstallationGrant,
} from "./github-api/app-auth.server.ts";
export {
	BOT_INSTALLATION_PERMISSIONS,
	fetchAccountInstallation,
	fetchGithubAppWebhookSettings,
	fetchRepoInstallation,
	mintInstallationToken,
	signAppJwt,
} from "./github-api/app-auth.server.ts";
export type { HolderRepoAccess } from "./github-api/collaborators.server.ts";
export {
	checkClaimHolderWriteAccess,
	fetchCollaboratorRepoAccess,
	fetchGithubLogin,
	fetchGithubLoginByUserId,
	holderRepoAccessFromPermission,
} from "./github-api/collaborators.server.ts";
export {
	createIssueComment,
	deleteIssueComment,
	listIssueComments,
	patchIssueComment,
} from "./github-api/comments.server.ts";
export {
	createGitRef,
	deleteRepoContents,
	fetchGitRef,
	fetchRepoContents,
	putRepoContents,
} from "./github-api/contents.server.ts";
export { githubFetch } from "./github-api/http.server.ts";
export type { GithubReviewListItem, PullFile } from "./github-api/json.ts";
export {
	createPullReview,
	createRepoPull,
	dismissPullReview,
	fetchCommentBody,
	fetchPullHeadSha,
	findOpenPullByHead,
	listPullFiles,
	listPullReviews,
} from "./github-api/pulls.server.ts";
export {
	createUserRepo,
	ensurePublicRuntimeRepo,
	fetchRepoDefaultBranch,
	fetchRepoPublicKey,
	fetchRepoWriteAccess,
	putRepoSecret,
	repoFromFullName,
} from "./github-api/repos.server.ts";
export {
	cancelWorkflowRun,
	dispatchWorkflow,
	findWorkflowRunByName,
	workflowRunIdFromUrl,
	workflowRunMatchesName,
} from "./github-api/workflows.server.ts";
export {
	addRepoToUserInstallation,
	fetchUserAppInstallation,
	listUserAppGrantedRepos,
} from "./github-api/user-installations.server.ts";
