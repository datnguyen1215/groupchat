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

export const load = async ({ params, depends, isDataRequest }) => {
	depends(`live:thread:${params.id}`);

	const thread = await getThread(params.id);
	/**
	 * A thread that vanishes under a reader is not the same as a URL that was
	 * never valid. Deleting the open thread publishes a live event, so this load
	 * re-runs against the row it just removed; erroring there would replace the
	 * page with a 404 and cancel the navigation the delete already started.
	 * Redirecting instead lets the client end up somewhere real either way.
	 */
	if (!thread) {
		if (isDataRequest) redirect(307, '/');
		error(404, 'Thread not found');
	}

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
