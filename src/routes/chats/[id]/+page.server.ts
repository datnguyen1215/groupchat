import { error, redirect } from '@sveltejs/kit';
import {
	appendMessage,
	clearStaleBusy,
	getThread,
	listBusyAgents,
	listDocuments,
	listEntries,
	listSteps
} from '$lib/server/repo';
import { startTurn } from '$lib/server/ai/loop';

export const load = async ({ params }) => {
	const thread = await getThread(params.id);
	if (!thread) error(404, 'Thread not found');

	/** A turn cut short by a restart would otherwise spin here forever. */
	await clearStaleBusy();

	const [entries, activity, busy, documents] = await Promise.all([
		listEntries(params.id),
		listSteps(params.id),
		listBusyAgents(params.id),
		listDocuments(params.id)
	]);

	return { thread, entries, activity, busy, threadDocs: documents };
};

export const actions = {
	default: async ({ request, params }) => {
		const data = await request.formData();
		const text = data.get('message')?.toString().trim();
		if (!text) redirect(303, `/chats/${params.id}`);

		await appendMessage({ threadId: params.id, authorId: 'you', paragraphs: [text] });

		/** Detached: the agents work on after this response is sent. */
		startTurn(params.id);

		redirect(303, `/chats/${params.id}`);
	}
};
