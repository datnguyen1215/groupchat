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

/** The signed-in user. Not an agent row; the rail renders it directly. */
export const you = { id: 'you', name: 'You', initials: 'DN', color: '#5b5b66' };
