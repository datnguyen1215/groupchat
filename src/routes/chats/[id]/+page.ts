import { error } from '@sveltejs/kit';
import { findThread, threads } from '$lib/data/threads';

export const entries = () => threads.map((thread) => ({ id: thread.id }));

export const load = ({ params }) => {
	const thread = findThread(params.id);
	if (!thread) error(404, 'Thread not found');
	return { thread };
};
