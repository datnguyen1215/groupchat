/** Which document or skill is open in a modal. Null when nothing is open. */
class Overlay {
  docId = $state<string | null>(null);
  skillId = $state<string | null>(null);

  openDoc(id: string) {
    this.docId = id;
  }

  openSkill(id: string) {
    this.skillId = id;
  }

  closeDoc() {
    this.docId = null;
  }

  closeSkill() {
    this.skillId = null;
  }
}

export const overlay = new Overlay();
