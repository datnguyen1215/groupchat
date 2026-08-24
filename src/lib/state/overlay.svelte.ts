import { logger } from '$lib/logger.svelte';

const log = logger('overlay');

/** Which document or skill is open in a modal. Null when nothing is open. */
class Overlay {
  docId = $state<string | null>(null);
  skillId = $state<string | null>(null);

  openDoc(id: string) {
    log.info({ id }, 'document opened');
    this.docId = id;
  }

  openSkill(id: string) {
    log.info({ id }, 'skill opened');
    this.skillId = id;
  }

  closeDoc() {
    log.info({ id: this.docId }, 'document closed');
    this.docId = null;
  }

  closeSkill() {
    log.info({ id: this.skillId }, 'skill closed');
    this.skillId = null;
  }
}

export const overlay = new Overlay();
