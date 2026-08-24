import { listSkills } from '$lib/server/repo';

export const load = async () => ({ skills: await listSkills() });
