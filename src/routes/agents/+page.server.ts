import { listAgents } from '$lib/server/repo';

/** The fixture exposed three named exports; the DB has one table split by `kind`. */
export const load = async () => {
	const [orchestrators, researchAgents, spawnedAgents] = await Promise.all([
		listAgents('orchestrator'),
		listAgents('research'),
		listAgents('spawned')
	]);
	return { orchestrator: orchestrators[0] ?? null, researchAgents, spawnedAgents };
};
