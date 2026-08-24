import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/** better-auth owns every method under /api/auth. */
export const GET: RequestHandler = ({ request }) => auth.handler(request);
export const POST: RequestHandler = ({ request }) => auth.handler(request);
