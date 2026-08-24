export type AgentStatus = 'idle' | 'busy' | 'done';

export type Agent = {
	id: string;
	name: string;
	initials: string;
	role: string;
	color: string;
	status: AgentStatus;
	statusLabel: string;
	description: string;
	skills: string[];
	stats: { value: string; label: string }[];
};

export const orchestrator: Agent = {
	id: 'orchestrator',
	name: 'Orchestrator',
	initials: 'O',
	role: 'Routes work · never answers directly',
	color: '#7aa2ff',
	status: 'busy',
	statusLabel: 'Active',
	description:
		'Decomposes the ask, assigns agents, and decides when a thread is done. Searches skills before delegating.',
	skills: ['skill_search', 'spawn', 'write_doc'],
	stats: [
		{ value: '142', label: 'messages' },
		{ value: '38', label: 'delegations' },
		{ value: '6', label: 'threads' }
	]
};

export const researchAgents: Agent[] = [
	{
		id: 'kestrel',
		name: 'Kestrel',
		initials: 'K',
		role: 'Analyst',
		color: '#4ec98a',
		status: 'busy',
		statusLabel: 'Running',
		description:
			"Designs measurements and reads results honestly. Pushes back when a number can't support the claim.",
		skills: ['eval-harness', 'ablation-planner', '+2'],
		stats: [
			{ value: '89', label: 'messages' },
			{ value: '31', label: 'tool calls' },
			{ value: '7', label: 'docs' }
		]
	},
	{
		id: 'wren',
		name: 'Wren',
		initials: 'W',
		role: 'Researcher',
		color: '#e8785d',
		status: 'idle',
		statusLabel: 'Idle',
		description:
			'Finds and summarizes prior art. Spawns readers in parallel when a search returns more than a few papers.',
		skills: ['paper-reader', 'citation-format'],
		stats: [
			{ value: '64', label: 'messages' },
			{ value: '118', label: 'tool calls' },
			{ value: '11', label: 'docs' }
		]
	},
	{
		id: 'finch',
		name: 'Finch',
		initials: 'F',
		role: 'Critic',
		color: '#b47aff',
		status: 'busy',
		statusLabel: 'Running',
		description:
			'Argues the other side. Looks for the assumption nobody stated and the cost nobody costed.',
		skills: ['relevance-judge', 'license-check'],
		stats: [
			{ value: '57', label: 'messages' },
			{ value: '22', label: 'tool calls' },
			{ value: '4', label: 'docs' }
		]
	}
];

export const spawnedAgents: Agent[] = [
	{
		id: 'paper-reader-x3',
		name: 'paper-reader ×3',
		initials: 'R',
		role: 'Ephemeral · spawned by Wren',
		color: '#2e2e35',
		status: 'done',
		statusLabel: 'Done',
		description:
			'Three parallel readers over BEIR, Chen et al. 2025, and the LoTTE splits. Merged into one summary.',
		skills: [],
		stats: [
			{ value: '24s', label: 'wall clock' },
			{ value: '3', label: 'instances' }
		]
	}
];

export const you = { id: 'you', name: 'You', initials: 'DN', color: '#5b5b66' };
