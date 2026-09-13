import type { TriggerPhrase } from "@hakasebot/core/domain.ts";
import { getRouteApi, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ENGINE_OPTIONS, engineLabel } from "#/lab/constants.ts";
import { m as msg } from "#/paraglide/messages.js";

import { SharkDoodle } from "./ui/doodles.tsx";

const aboutRoute = getRouteApi("/about");

function NoteHeading(props: { children: ReactNode }): ReactNode {
	return (
		<h2 className="text-accent-strong ink-outline mt-8 mb-0 text-2xl font-bold">
			{props.children}
		</h2>
	);
}

function PullRequestNotes(props: {
	trigger: TriggerPhrase | undefined;
}): ReactNode {
	return (
		<>
			<NoteHeading>{msg.about_pr_heading()}</NoteHeading>
			<p className="text-ink/80 mt-3 mb-0 max-w-[54ch]">
				{msg.about_pr_body_1({
					poke:
						props.trigger === undefined
							? msg.about_pr_poke()
							: msg.about_pr_poke_trigger({ trigger: props.trigger }),
				})}
			</p>
			<p className="text-ink/80 mt-3 mb-0 max-w-[54ch]">
				{msg.about_pr_body_2()}
			</p>
		</>
	);
}

function HouseNotes(): ReactNode {
	return (
		<>
			<NoteHeading>{msg.about_house_heading()}</NoteHeading>
			<p className="text-ink/80 mt-3 mb-0 max-w-[54ch]">
				{msg.about_house_body()}
			</p>
		</>
	);
}

function KeyNotes(): ReactNode {
	return (
		<>
			<NoteHeading>{msg.about_key_heading()}</NoteHeading>
			<p className="text-ink/80 mt-3 mb-0 max-w-[54ch]">
				{msg.about_key_body()}
			</p>
		</>
	);
}

function TurnItOnNotes(): ReactNode {
	return (
		<>
			<NoteHeading>{msg.about_on_heading()}</NoteHeading>
			<p className="text-ink/80 mt-3 mb-0 max-w-[54ch]">
				{msg.about_on_intro()}
			</p>
			<ol className="text-ink/80 mt-4 mb-0 flex max-w-[54ch] list-decimal flex-col gap-3 pl-5">
				<li>
					<span className="font-bold">{msg.about_on_secret_title()}</span>{" "}
					{msg.about_on_secret_body()}
				</li>
				<li>
					<span className="font-bold">{msg.about_on_brain_title()}</span>{" "}
					{msg.about_on_brain_body()}
				</li>
				<li>
					<span className="font-bold">{msg.about_on_house_title()}</span>{" "}
					{msg.about_on_house_body()}
				</li>
				<li>
					<span className="font-bold">{msg.about_on_let_in_title()}</span>{" "}
					{msg.about_on_let_in_body()}
				</li>
				<li>
					<span className="font-bold">{msg.about_on_key_title()}</span>{" "}
					{msg.about_on_key_body()}
				</li>
			</ol>
		</>
	);
}

function WakeNotes(): ReactNode {
	return (
		<>
			<NoteHeading>{msg.about_wake_heading()}</NoteHeading>
			<p className="text-ink/80 mt-3 mb-0 max-w-[54ch]">
				{msg.about_wake_body()}
			</p>
		</>
	);
}

function BrainNotes(): ReactNode {
	return (
		<>
			<h2 className="text-accent-strong ink-outline mt-8 mb-0 inline-flex items-baseline gap-2 text-2xl font-bold">
				{msg.about_brains_heading()}
				<SharkDoodle className="text-eye text-lg" />
			</h2>
			<p className="text-ink/80 mt-3 mb-0 max-w-[54ch]">
				{msg.about_brains_body({
					antigravity: engineLabel("antigravity"),
					engines: ENGINE_OPTIONS.map((option) => option.label).join("!! "),
				})}
			</p>
		</>
	);
}

export function AboutPage(): ReactNode {
	const { trigger } = aboutRoute.useLoaderData();
	return (
		<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
			<p className="text-accent-strong ink-outline m-0">{msg.about_kicker()}</p>
			<h1 className="text-accent-strong ink-outline mt-1 mb-0 text-4xl font-bold sm:text-5xl">
				hakasebot
			</h1>
			<p className="text-ink/80 mt-4 mb-0 max-w-[54ch]">{msg.about_intro()}</p>
			<PullRequestNotes trigger={trigger} />
			<HouseNotes />
			<KeyNotes />
			<TurnItOnNotes />
			<WakeNotes />
			<BrainNotes />
			<p className="mt-8 mb-0">
				<Link to="/">{msg.about_back()}</Link>
			</p>
		</main>
	);
}
