import { listDocuments, listSkills } from '$lib/server/repo';

/**
 * DocModal and SkillModal are rendered by the layout and opened by id from any
 * page, so their lookup data has to be available everywhere. Loading the
 * collections here keeps the modals' synchronous `find` and avoids a per-open
 * fetch with a loading state.
 */
export const load = async () => {
  const [documents, skills] = await Promise.all([listDocuments(), listSkills()]);
  return { documents, skills };
};
