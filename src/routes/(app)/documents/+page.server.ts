import { listDocuments } from '$lib/server/repo';

export const load = async () => ({ documents: await listDocuments() });
