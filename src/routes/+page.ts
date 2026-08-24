import { redirect } from '@sveltejs/kit';
import { threads } from '$lib/data/threads';

export const load = () => redirect(307, `/chats/${threads[0].id}`);
