/** Tiny unicode / scribble doodles — not emoji. Hakase's lab junk. */

import type { ReactNode } from "react";

/** Sakamoto — grey fur, red scarf. */
export function CatDoodle({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={`inline-flex items-baseline gap-0.5 leading-none ${className ?? ""}`}
		>
			<span className="text-key">=^･ω･^=</span>
			<span className="text-scarf">∿</span>
		</span>
	);
}

/** Nano's wind-up key — shaft + two stacked rings. */
export function KeyDoodle({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden
			viewBox="0 0 20 16"
			fill="none"
			className={className ?? "text-key inline-block size-4 shrink-0"}
		>
			<path
				d="M2 8h8"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
			<path
				d="M2 8v3.5h2"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="14" cy="5" r="3" stroke="currentColor" strokeWidth="1.6" />
			<circle cx="14" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" />
		</svg>
	);
}

/** Hakase loves sharks. */
export function SharkDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-eye"}>
			{"/^)_))/><"}
		</span>
	);
}

/** Little lab beaker. */
export function BeakerDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-mint"}>
			⌈∵⌉
		</span>
	);
}

/** Snacks / pudding energy. */
export function SnackDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-accent-strong"}>
			(っ˘ڡ˘ς)
		</span>
	);
}

/** Hakase's red tie scribble. */
export function TieDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-scarf"}>
			▼
		</span>
	);
}

export function FlowerDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-accent-strong"}>
			✿
		</span>
	);
}

export function SparkleDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-eye"}>
			✦
		</span>
	);
}

export function StarDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-accent-strong"}>
			★
		</span>
	);
}

/** Cowlick / messy hair flick. */
export function CowlickDoodle({ className }: { className?: string }) {
	return (
		<span aria-hidden className={className ?? "text-accent-strong"}>
			〜彡
		</span>
	);
}

/**
 * Keep clear of the centered ~42rem text column.
 * left/right use the side gutters; a few float above/below the copy.
 */
interface ScatterItem {
	id: string;
	node: ReactNode;
	style: {
		left?: string;
		right?: string;
		top?: string;
		bottom?: string;
		opacity?: number;
		transform: string;
	};
	/** Hide when the gutter disappears (narrow viewports). */
	wideOnly?: boolean;
}

const scatter: ScatterItem[] = [
	{
		id: "shark-nw",
		node: <SharkDoodle />,
		style: {
			left: "max(0.4rem, calc(50% - 28rem))",
			opacity: 0.9,
			top: "4%",
			transform: "rotate(-18deg)",
		},
	},
	{
		id: "key-ne",
		node: <KeyDoodle className="text-key size-5" />,
		style: {
			opacity: 0.85,
			right: "max(0.6rem, calc(50% - 25rem))",
			top: "11%",
			transform: "rotate(23deg)",
		},
	},
	{
		id: "flower-w",
		node: <FlowerDoodle className="text-accent-strong text-base" />,
		style: {
			left: "max(1.2rem, calc(50% - 24rem))",
			top: "27%",
			transform: "rotate(9deg) scale(1.2)",
		},
		wideOnly: true,
	},
	{
		id: "cat-e",
		node: <CatDoodle />,
		style: {
			opacity: 0.95,
			right: "max(0.3rem, calc(50% - 29rem))",
			top: "33%",
			transform: "rotate(-11deg)",
		},
		wideOnly: true,
	},
	{
		id: "beaker-w",
		node: <BeakerDoodle />,
		style: {
			left: "max(0.8rem, calc(50% - 26.5rem))",
			opacity: 0.8,
			top: "49%",
			transform: "rotate(14deg)",
		},
		wideOnly: true,
	},
	{
		id: "tie-e",
		node: <TieDoodle className="text-scarf text-lg" />,
		style: {
			right: "max(1.5rem, calc(50% - 23rem))",
			top: "46%",
			transform: "rotate(31deg)",
		},
		wideOnly: true,
	},
	{
		id: "snack-e",
		node: <SnackDoodle />,
		style: {
			opacity: 0.9,
			right: "max(0.5rem, calc(50% - 27rem))",
			top: "61%",
			transform: "rotate(-21deg)",
		},
		wideOnly: true,
	},
	{
		id: "cowlick-w",
		node: <CowlickDoodle />,
		style: {
			left: "max(0.2rem, calc(50% - 30rem))",
			top: "68%",
			transform: "rotate(7deg)",
		},
		wideOnly: true,
	},
	{
		id: "sparkle-w",
		node: <SparkleDoodle className="text-eye text-base" />,
		style: {
			left: "max(1.8rem, calc(50% - 23.5rem))",
			opacity: 0.75,
			top: "81%",
			transform: "rotate(-8deg) scale(1.3)",
		},
	},
	{
		id: "star-e",
		node: <StarDoodle className="text-accent-strong text-base" />,
		style: {
			right: "max(2rem, calc(50% - 24.5rem))",
			top: "78%",
			transform: "rotate(16deg)",
		},
	},
	{
		id: "cat-sw",
		node: <CatDoodle className="text-sm" />,
		style: {
			bottom: "3%",
			left: "max(0.6rem, calc(50% - 27rem))",
			transform: "rotate(19deg)",
		},
		wideOnly: true,
	},
	{
		id: "shark-se",
		node: <SharkDoodle className="text-eye" />,
		style: {
			bottom: "8%",
			opacity: 0.85,
			right: "max(0.4rem, calc(50% - 28.5rem))",
			transform: "rotate(-27deg)",
		},
		wideOnly: true,
	},
	{
		id: "key-far-w",
		node: <KeyDoodle className="text-key size-3.5" />,
		style: {
			left: "max(0.1rem, calc(50% - 31rem))",
			opacity: 0.7,
			top: "38%",
			transform: "rotate(-33deg)",
		},
		wideOnly: true,
	},
	{
		id: "flower-far-e",
		node: <FlowerDoodle className="text-accent-strong" />,
		style: {
			opacity: 0.65,
			right: "max(0.1rem, calc(50% - 31.5rem))",
			top: "17%",
			transform: "rotate(41deg)",
		},
		wideOnly: true,
	},
	{
		id: "beaker-high",
		node: <BeakerDoodle className="text-mint" />,
		style: {
			left: "max(2.5rem, calc(50% - 22.5rem))",
			opacity: 0.7,
			top: "2%",
			transform: "rotate(-5deg)",
		},
		wideOnly: true,
	},
	{
		id: "star-low-e",
		node: <StarDoodle />,
		style: {
			bottom: "14%",
			opacity: 0.8,
			right: "max(1.1rem, calc(50% - 25rem))",
			transform: "rotate(-14deg) scale(0.9)",
		},
		wideOnly: true,
	},
];

/** Messy scatter of hakase doodles — gutters only, not on the copy. */
export function DoodleScatter() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden text-sm leading-none select-none"
		>
			{scatter.map((item) => (
				<span
					key={item.id}
					className={
						item.wideOnly === true ? "absolute max-md:hidden" : "absolute"
					}
					style={item.style}
				>
					{item.node}
				</span>
			))}
		</div>
	);
}
