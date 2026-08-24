/**
 * Thread ids the seed pins. Real threads get a random UUID from `createThread`;
 * these two are fixed so tests can navigate straight to a known thread.
 */
export const SEED_THREADS = {
  retrievalEval: '11111111-1111-4111-8111-111111111111',
  ablationContext: '22222222-2222-4222-8222-222222222222'
} as const;
