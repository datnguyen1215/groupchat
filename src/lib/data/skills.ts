export type Skill = {
	id: string;
	name: string;
	version: string;
	description: string;
	author: string;
	authorInitials: string;
	authorColor: string;
	authoredBy: 'you' | 'agent';
	updated: string;
	uses: number;
	usedBy: string[];
	body: string;
};

export const skills: Skill[] = [
	{
		id: 'relevance-judge',
		name: 'relevance-judge',
		version: 'v1',
		description:
			'Grades a retrieved passage 0–3 against a query. Returns a score plus a one-line justification.',
		author: 'Finch',
		authorInitials: 'F',
		authorColor: '#b47aff',
		authoredBy: 'agent',
		updated: 'just now',
		uses: 1,
		usedBy: ['Finch'],
		body: `# relevance-judge

Grades one retrieved passage against one query on a 0–3 scale. Used as the first-pass labeler in the retrieval eval, with human spot-checks on 10%.

## When to use

- Labeling retrieval results where hand-annotation is too slow.
- **Not** for final reported numbers without a human sample.

## Rubric

| Score | Criterion |
| --- | --- |
| 3 | Passage directly answers the query |
| 2 | Strongly related; adjacent to the answer |
| 1 | Same topic, does not address the query |
| 0 | Irrelevant |

> Judge the passage alone. Do not reward fluency, length, or confident phrasing.

## Interface

\`\`\`
judge(query: str, passage: str) -> {
  "score": 0 | 1 | 2 | 3,
  "why": str,   # one line, max 20 words
}
\`\`\`

### Notes

Agreement with human labels measured at κ = 0.71 on a 40-item pilot. Disagreements cluster on the 1/2 boundary.`
	},
	{
		id: 'eval-harness',
		name: 'eval-harness',
		version: 'v4',
		description:
			'Runs a metric sweep over a corpus and query set. Emits recall@k, MRR, nDCG with confidence intervals.',
		author: 'You',
		authorInitials: 'DN',
		authorColor: '#5b5b66',
		authoredBy: 'you',
		updated: '3d ago',
		uses: 12,
		usedBy: ['Kestrel', 'Orchestrator'],
		body: `# eval-harness

Runs a metric sweep over a corpus and query set, then reports each metric with a bootstrap confidence interval.

## When to use

- Any time a retrieval or ranking change needs a number attached to it.
- **Not** for single-query debugging — the bootstrap needs a sample.

## Interface

\`\`\`
Harness(corpus, queries, judge, metrics).run(sample, seed)
\`\`\`

> Always pass a seed. An unseeded run cannot be compared to a previous one.`
	},
	{
		id: 'paper-reader',
		name: 'paper-reader',
		version: 'v7',
		description:
			'Extracts claim, method, and reported numbers from a paper. Flags whether results look reproducible.',
		author: 'Wren',
		authorInitials: 'W',
		authorColor: '#e8785d',
		authoredBy: 'agent',
		updated: '1w ago',
		uses: 47,
		usedBy: ['Wren'],
		body: `# paper-reader

Reads one paper and returns a structured summary: central claim, method, reported numbers, and a reproducibility flag.

## Reproducibility flag

| Flag | Meaning |
| --- | --- |
| green | Code and data both public |
| amber | One of the two missing |
| red | Neither, or numbers unsourced |

> Report the paper's own numbers. Do not normalize, rescale, or reconcile them against other papers.`
	},
	{
		id: 'ablation-planner',
		name: 'ablation-planner',
		version: 'v3',
		description:
			'Turns a hypothesis into a minimal factorial design. Warns when a factor is confounded.',
		author: 'Kestrel',
		authorInitials: 'K',
		authorColor: '#4ec98a',
		authoredBy: 'agent',
		updated: '5d ago',
		uses: 19,
		usedBy: ['Kestrel'],
		body: `# ablation-planner

Turns a stated hypothesis into the smallest factorial design that can test it, and names the confounds it cannot remove.

## Output

- Factor list with levels
- Run count
- Confound warnings

> A design that cannot separate two factors should say so rather than quietly averaging over one.`
	},
	{
		id: 'citation-format',
		name: 'citation-format',
		version: 'v2',
		description:
			'Normalizes references to a house style. Resolves DOIs and dedupes near-identical entries.',
		author: 'You',
		authorInitials: 'DN',
		authorColor: '#5b5b66',
		authoredBy: 'you',
		updated: '2w ago',
		uses: 8,
		usedBy: ['Wren'],
		body: `# citation-format

Normalizes a reference list to house style, resolves DOIs, and merges near-identical entries.

> Never invent a DOI. An unresolved reference stays unresolved and is marked.`
	},
	{
		id: 'license-check',
		name: 'license-check',
		version: 'v1',
		description:
			'Reads a dataset card and classifies redistribution rights. Escalates anything non-commercial.',
		author: 'Finch',
		authorInitials: 'F',
		authorColor: '#b47aff',
		authoredBy: 'agent',
		updated: '1w ago',
		uses: 6,
		usedBy: ['Finch', 'Orchestrator'],
		body: `# license-check

Reads a dataset card and classifies redistribution rights into clear, restricted, or blocked.

> Anything non-commercial escalates to a human. The skill does not decide acceptable risk.`
	}
];

export const findSkill = (id: string) => skills.find((s) => s.id === id);
