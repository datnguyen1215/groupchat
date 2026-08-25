import { redirect } from '@sveltejs/kit';
import { listThreads } from '$lib/server/repo';

/**
 * `/` is a shim onto the newest thread. With none to land on it renders its own
 * empty page instead of erroring — an empty list is a normal state, and 404ing
 * here escapes the layout, leaving no rail and no way to create the first one.
 */
export const load = async () => {
  const [first] = await listThreads();
  if (first) redirect(307, `/chats/${first.id}`);
};
