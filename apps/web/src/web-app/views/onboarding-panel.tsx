import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import { m as msg } from "#/paraglide/messages.js";
import type { WebAppTab } from "#/web-app/domain.ts";

interface OnboardingStep {
	blurb: () => string;
	button: () => string;
	tab: WebAppTab;
	title: () => string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		blurb: msg.onboarding_secret_blurb,
		button: msg.onboarding_secret_button,
		tab: "accounts",
		title: msg.onboarding_secret_title,
	},
	{
		blurb: msg.onboarding_brain_blurb,
		button: msg.onboarding_brain_button,
		tab: "models",
		title: msg.onboarding_brain_title,
	},
	{
		blurb: msg.onboarding_house_blurb,
		button: msg.onboarding_house_button,
		tab: "settings",
		title: msg.onboarding_house_title,
	},
	{
		blurb: msg.onboarding_let_in_blurb,
		button: msg.onboarding_let_in_button,
		tab: "repos",
		title: msg.onboarding_let_in_title,
	},
	{
		blurb: msg.onboarding_key_blurb,
		button: msg.onboarding_key_button,
		tab: "settings",
		title: msg.onboarding_key_title,
	},
];

function OnboardingStepItem(props: {
	onNavigate: (tab: WebAppTab) => void;
	step: OnboardingStep;
}): ReactNode {
	return (
		<li>
			<span className="font-bold">{props.step.title()}</span>
			<p className="text-ink/75 m-0 mt-1">{props.step.blurb()}</p>
			<Button
				className="mt-2"
				variant="ghost"
				onPress={() => {
					props.onNavigate(props.step.tab);
				}}
			>
				{props.step.button()}
			</Button>
		</li>
	);
}

export function OnboardingPanel(props: {
	onNavigate: (tab: WebAppTab) => void;
}): ReactNode {
	return (
		<Section>
			<Label>{msg.onboarding_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.onboarding_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.onboarding_intro()}
			</p>
			<ol className="mt-6 flex list-decimal flex-col gap-4 pl-5">
				{ONBOARDING_STEPS.map((step) => (
					<OnboardingStepItem
						key={step.tab + step.title()}
						onNavigate={props.onNavigate}
						step={step}
					/>
				))}
			</ol>
		</Section>
	);
}
