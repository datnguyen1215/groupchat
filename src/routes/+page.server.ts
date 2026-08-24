import { error, redirect } from '@sveltejs/kit';
import { listThreads } from '$lib/server/repo';

export const load = async () => {
  const [first] = await listThreads();
  if (!first) error(404, 'No threads');
  redirect(307, `/chats/${first.id}`);
};
