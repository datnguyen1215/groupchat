export type Skill = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  authorInitials: string;
  authorColor: string;
  authoredBy: 'you' | 'agent';
  updated: string;
  uses: number;
  usedBy: string[];
  body: string;
};
