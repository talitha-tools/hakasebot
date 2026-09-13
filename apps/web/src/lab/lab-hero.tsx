import { Link } from "@tanstack/react-router";

import { engineLabel } from "#/lab/constants.ts";
import { m as msg } from "#/paraglide/messages.js";

import { SignInWithGithubButton } from "./sign-in-button";

function HowItWorksSteps() {
	return (
		<ol className="text-ink/75 mt-4 mb-0 flex max-w-[48ch] list-decimal flex-col gap-3 pl-5">
			<li>
				<span className="font-bold">{msg.lab_hero_step_signin_title()}</span>{" "}
				{msg.lab_hero_step_signin_body()}
			</li>
			<li>
				<span className="font-bold">{msg.lab_hero_step_secrets_title()}</span>{" "}
				{msg.lab_hero_step_secrets_body({
					keyEngine: engineLabel("cursor"),
					loginEngine: engineLabel("claude"),
				})}
			</li>
			<li>
				<span className="font-bold">{msg.lab_hero_step_brain_title()}</span>{" "}
				{msg.lab_hero_step_brain_body()}
			</li>
			<li>
				<span className="font-bold">{msg.lab_hero_step_house_title()}</span>{" "}
				{msg.lab_hero_step_house_body()}
			</li>
			<li>
				<span className="font-bold">{msg.lab_hero_step_let_in_title()}</span>{" "}
				{msg.lab_hero_step_let_in_body()}
			</li>
			<li>
				<span className="font-bold">{msg.lab_hero_step_lines_title()}</span>{" "}
				{msg.lab_hero_step_lines_body()}
			</li>
		</ol>
	);
}

export function LabHero() {
	return (
		<section className="py-4">
			<p className="m-0 inline-flex flex-wrap items-baseline gap-2">
				<span className="text-accent-strong ink-outline">
					{msg.lab_hero_kicker()}
				</span>
			</p>
			<h1 className="text-accent-strong ink-outline mt-2 mb-0 text-[clamp(2.75rem,12vw,4.5rem)] leading-none font-bold">
				hakasebot
			</h1>
			<p className="mt-4 mb-0 max-w-[32ch] text-xl leading-snug italic">
				{msg.lab_hero_tagline()}
			</p>
			<p className="text-ink/75 mt-3 mb-0 max-w-[48ch]">
				{msg.lab_hero_intro()}
			</p>

			<h2 className="text-accent-strong ink-outline mt-8 mb-0 text-2xl font-bold">
				{msg.lab_hero_how_heading()}
			</h2>
			<p className="text-ink/75 mt-3 mb-0 max-w-[48ch]">
				{msg.lab_hero_how_intro()}
			</p>
			<HowItWorksSteps />
			<p className="text-ink/75 mt-4 mb-0 max-w-[48ch]">
				{msg.lab_hero_more_before()}{" "}
				<Link to="/about" className="text-eye font-bold">
					{msg.lab_hero_more_link()}
				</Link>{" "}
				{msg.lab_hero_more_after()}
			</p>

			<div className="mt-6">
				<SignInWithGithubButton />
			</div>
		</section>
	);
}
