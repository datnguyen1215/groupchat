export type Doc = {
	id: string;
	name: string;
	threadId: string;
	threadName: string;
	author: string;
	authorInitials: string;
	authorColor: string;
	updated: string;
	version: string;
	size: string;
	body: string;
};

const evalProtocol = `# Retrieval Evaluation Protocol

Defines how we measure retrieval quality for the domain corpus. Supersedes the ad-hoc recall checks in \`corpus-stats.md\`.

## Metrics

- **recall@k** — k ∈ {1, 5, 10, 50}. Primary gate.
- **MRR** — sanity check on ranking.
- **nDCG@10** — graded relevance, 0–3 scale.

> BEIR overstates performance on our corpus by ~11 pts. Do not report BEIR numbers without the domain caveat.

## Labeling

First pass uses LLM-as-judge via the \`relevance-judge\` skill. Human spot-check on a 10% stratified sample.

| Grade | Meaning | Example |
| --- | --- | --- |
| 3 | Directly answers | Exact procedure |
| 2 | Strongly related | Adjacent section |
| 1 | Topical only | Same domain |
| 0 | Irrelevant | — |

## Harness

\`\`\`
eval = Harness(
  corpus="domain-v4",
  queries="queries/gold-200.jsonl",
  judge=skill("relevance-judge"),
  metrics=["recall@k", "mrr", "ndcg@10"],
)
eval.run(sample=200, seed=7)
\`\`\`

### Acceptance

Ship gate: \`recall@10 ≥ 0.82\` and \`nDCG@10 ≥ 0.61\` on the held-out split.

---

Related: prior-art-retrieval-eval.md · relevance-judge`;

const priorArt = `# Prior Art — Retrieval Evaluation

Fourteen papers pulled, three directly relevant to a domain-specific corpus.

## Directly relevant

- **BEIR (Thakur et al., 2021)** — the default zero-shot benchmark. Broad, but every task is open-domain.
- **Chen et al., 2025** — measures the domain-shift penalty directly. Reports 8–14 pt drops.
- **LoTTE splits** — long-tail topic evaluation. Closest in shape to our corpus.

## Takeaway

> BEIR is a baseline, not a proxy. Report it with the domain caveat or not at all.

Recommend building a gold set of 200 in-domain queries rather than borrowing splits.`;

const corpusStats = `# Corpus Statistics

Snapshot of \`domain-v4\` before the eval run.

| Field | Value |
| --- | --- |
| Documents | 41,208 |
| Median length | 640 tokens |
| Duplicate rate | 3.1% |
| Date range | 2019–2026 |

Deduplication used MinHash at threshold 0.85. The remaining near-duplicates are template boilerplate and are safe to keep.`;

const openQuestions = `# Open Questions

- Who owns the gold query set once it exists?
- Do we gate on \`recall@10\` alone, or on both metrics jointly?
- Is 10% enough for the human spot-check at our variance?
- What happens to the eval when the corpus version bumps?`;

export const documents: Doc[] = [
	{
		id: 'eval-protocol-v1',
		name: 'eval-protocol-v1.md',
		threadId: 'retrieval-eval',
		threadName: 'Retrieval eval design',
		author: 'Kestrel',
		authorInitials: 'K',
		authorColor: '#4ec98a',
		updated: '10:16',
		version: 'v3',
		size: '4.8 KB',
		body: evalProtocol
	},
	{
		id: 'prior-art-retrieval-eval',
		name: 'prior-art-retrieval-eval.md',
		threadId: 'retrieval-eval',
		threadName: 'Retrieval eval design',
		author: 'Wren',
		authorInitials: 'W',
		authorColor: '#e8785d',
		updated: '10:07',
		version: 'v1',
		size: '2.1 KB',
		body: priorArt
	},
	{
		id: 'corpus-stats',
		name: 'corpus-stats.md',
		threadId: 'retrieval-eval',
		threadName: 'Retrieval eval design',
		author: 'Kestrel',
		authorInitials: 'K',
		authorColor: '#4ec98a',
		updated: '09:41',
		version: 'v2',
		size: '1.4 KB',
		body: corpusStats
	},
	{
		id: 'open-questions',
		name: 'open-questions.md',
		threadId: 'retrieval-eval',
		threadName: 'Retrieval eval design',
		author: 'Finch',
		authorInitials: 'F',
		authorColor: '#b47aff',
		updated: '09:20',
		version: 'v1',
		size: '0.6 KB',
		body: openQuestions
	},
	{
		id: 'ablation-design',
		name: 'ablation-design.md',
		threadId: 'ablation-context',
		threadName: 'Ablation: context window',
		author: 'Kestrel',
		authorInitials: 'K',
		authorColor: '#4ec98a',
		updated: 'Yesterday',
		version: 'v5',
		size: '3.2 KB',
		body: '# Ablation Design\n\nFactorial sweep over context window size and retrieval depth.\n\n- Window ∈ {4k, 8k, 16k, 32k}\n- Depth ∈ {5, 10, 20}\n\n> Window and depth are confounded through total tokens. Hold token budget fixed or the effect is unreadable.'
	},
	{
		id: 'sparse-attention-survey',
		name: 'sparse-attention-survey.md',
		threadId: 'sparse-attention',
		threadName: 'Sparse attention survey',
		author: 'Wren',
		authorInitials: 'W',
		authorColor: '#e8785d',
		updated: 'Yesterday',
		version: 'v2',
		size: '7.9 KB',
		body: '# Sparse Attention — Survey\n\nTwenty-two papers clustered into four families: fixed patterns, learned routing, low-rank, and hybrid recurrence.\n\nMost reported speedups do not survive a fair wall-clock comparison at our sequence lengths.'
	},
	{
		id: 'licensing-audit',
		name: 'licensing-audit.md',
		threadId: 'licensing',
		threadName: 'Dataset licensing',
		author: 'Finch',
		authorInitials: 'F',
		authorColor: '#b47aff',
		updated: 'Mon',
		version: 'v1',
		size: '2.7 KB',
		body: '# Dataset Licensing Audit\n\nTwo of nine datasets are CC-BY-NC and cannot ship in a commercial artifact.\n\n| Dataset | License | Verdict |\n| --- | --- | --- |\n| corpus-a | CC-BY | Clear |\n| corpus-b | CC-BY-NC | Blocked |\n| corpus-c | CC-BY-NC | Blocked |'
	},
	{
		id: 'weekly-synthesis',
		name: 'weekly-synthesis.md',
		threadId: 'weekly',
		threadName: 'Weekly synthesis',
		author: 'Orchestrator',
		authorInitials: 'O',
		authorColor: '#7aa2ff',
		updated: 'Mon',
		version: 'v1',
		size: '1.9 KB',
		body: '# Weekly Synthesis\n\nThe eval protocol landed and the licensing audit closed two datasets. Ablation is the open front.'
	}
];

export const findDoc = (id: string) => documents.find((d) => d.id === id);
