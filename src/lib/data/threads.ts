export type Message = {
  kind: 'message';
  id: string;
  author: string;
  initials: string;
  color: string;
  tag?: string;
  isOrchestrator?: boolean;
  isYou?: boolean;
  time: string;
  paragraphs: string[];
  docId?: string;
};

export type Entry = Message;

/**
 * One thing that happened in the thread. `ok`/`run`/`spawn` are tool calls,
 * `say` is an agent commenting, `doc` is a document written or updated — the
 * feed shows all of them on one clock.
 */
export type Step = {
  id: string;
  state: 'ok' | 'run' | 'spawn' | 'say' | 'doc';
  name: string;
  detail: string;
  duration: string;
  child?: boolean;
  badge?: string;
};

export type StepGroup = { id: string; label: string; steps: Step[] };

export type Thread = {
  id: string;
  name: string;
  group: 'Active' | 'Recent';
  live: boolean;
  unread?: number;
  preview: string;
  participants: { initials: string; color: string }[];
  entries: Entry[];
  activity: StepGroup[];
  docIds: string[];
};

const retrievalEval: Thread = {
  id: 'retrieval-eval',
  name: 'Retrieval eval design',
  group: 'Active',
  live: true,
  unread: 3,
  preview: "Finch: Rubric's in. Registered…",
  participants: [
    { initials: 'O', color: '#7aa2ff' },
    { initials: 'K', color: '#4ec98a' },
    { initials: 'W', color: '#e8785d' },
    { initials: 'F', color: '#b47aff' }
  ],
  entries: [
    {
      kind: 'message',
      id: 'm1',
      author: 'Orchestrator',
      initials: 'O',
      color: '#7aa2ff',
      tag: 'orch',
      isOrchestrator: true,
      time: '10:02',
      paragraphs: [
        'We need an eval for the retrieval layer. Kestrel, take metrics. Wren, find prior art.'
      ]
    },
    {
      kind: 'message',
      id: 'm2',
      author: 'Kestrel',
      initials: 'K',
      color: '#4ec98a',
      tag: 'analyst',
      time: '10:02',
      paragraphs: ['On it. Starting with recall@k and MRR.']
    },
    {
      kind: 'message',
      id: 'm3',
      author: 'Wren',
      initials: 'W',
      color: '#e8785d',
      tag: 'researcher',
      time: '10:03',
      paragraphs: [
        'BEIR is the obvious baseline. But our corpus is domain-specific — BEIR will overstate.'
      ]
    },
    {
      kind: 'message',
      id: 'm4',
      author: 'Wren',
      initials: 'W',
      color: '#e8785d',
      tag: 'researcher',
      time: '10:07',
      paragraphs: ['Pulled 14 papers. Three are directly relevant.'],
      docId: 'prior-art-retrieval-eval'
    },
    {
      kind: 'message',
      id: 'm5',
      author: 'Kestrel',
      initials: 'K',
      color: '#4ec98a',
      tag: 'analyst',
      time: '10:08',
      paragraphs: ["Wren's right about the domain gap. I'd add nDCG@10 with graded relevance."]
    },
    {
      kind: 'message',
      id: 'm6',
      author: 'Finch',
      initials: 'F',
      color: '#b47aff',
      tag: 'critic',
      time: '10:09',
      paragraphs: ['Graded relevance needs annotators. Who labels?']
    },
    {
      kind: 'message',
      id: 'm7',
      author: 'You',
      initials: 'DN',
      color: '#5b5b66',
      isYou: true,
      time: '10:11',
      paragraphs: ['Use LLM-as-judge for the first pass. Human spot-check 10%.']
    },
    {
      kind: 'message',
      id: 'm8',
      author: 'Orchestrator',
      initials: 'O',
      color: '#7aa2ff',
      tag: 'orch',
      isOrchestrator: true,
      time: '10:14',
      paragraphs: [
        'Agreed. Kestrel — write the protocol. Finch, draft the judge rubric as a skill so we reuse it.'
      ]
    },
    {
      kind: 'message',
      id: 'm9',
      author: 'Finch',
      initials: 'F',
      color: '#b47aff',
      tag: 'critic',
      time: '10:16',
      paragraphs: ['Rubric’s in. Registered as `relevance-judge`.'],
      docId: 'eval-protocol-v1'
    }
  ],
  activity: [
    {
      id: 'g1',
      label: '10:03 · Wren',
      steps: [
        {
          id: 's1',
          state: 'ok',
          name: 'web_search',
          detail: '"retrieval eval benchmark domain shift"',
          duration: '1.2s'
        },
        { id: 's2', state: 'ok', name: 'fetch_arxiv', detail: '14 results', duration: '3.4s' },
        {
          id: 's3',
          state: 'spawn',
          name: 'spawn',
          badge: 'agent ×3',
          detail: 'paper-reader',
          duration: '—'
        },
        {
          id: 's4',
          state: 'ok',
          name: 'reader-1',
          detail: 'BEIR (Thakur 2021)',
          duration: '8s',
          child: true
        },
        {
          id: 's5',
          state: 'ok',
          name: 'reader-2',
          detail: 'Chen et al. 2025 — domain shift',
          duration: '7s',
          child: true
        },
        {
          id: 's6',
          state: 'ok',
          name: 'reader-3',
          detail: 'LoTTE splits',
          duration: '9s',
          child: true
        },
        {
          id: 's7',
          state: 'ok',
          name: 'write_doc',
          detail: 'prior-art-retrieval-eval.md',
          duration: '0.4s'
        }
      ]
    },
    {
      id: 'g2',
      label: '10:12 · Kestrel',
      steps: [
        {
          id: 's8',
          state: 'ok',
          name: 'skill_search',
          detail: '"llm judge rubric"',
          duration: '0.2s'
        },
        { id: 's9', state: 'ok', name: 'skill_read', detail: 'eval-harness', duration: '0.1s' },
        {
          id: 's10',
          state: 'ok',
          name: 'write_doc',
          detail: 'eval-protocol-v1.md',
          duration: '0.6s'
        }
      ]
    },
    {
      id: 'g3',
      label: '10:15 · Finch',
      steps: [
        {
          id: 's11',
          state: 'ok',
          name: 'skill_write',
          detail: 'relevance-judge',
          duration: '0.3s'
        },
        {
          id: 's12',
          state: 'run',
          name: 'run_eval',
          detail: 'sample n=200, seed=7',
          duration: 'running'
        }
      ]
    }
  ],
  docIds: ['eval-protocol-v1', 'prior-art-retrieval-eval', 'corpus-stats', 'open-questions']
};

const ablation: Thread = {
  id: 'ablation-context',
  name: 'Ablation: context window',
  group: 'Active',
  live: true,
  preview: 'Kestrel: Running sweep at n=8…',
  participants: [
    { initials: 'O', color: '#7aa2ff' },
    { initials: 'K', color: '#4ec98a' }
  ],
  entries: [
    {
      kind: 'message',
      id: 'b1',
      author: 'Orchestrator',
      initials: 'O',
      color: '#7aa2ff',
      tag: 'orch',
      isOrchestrator: true,
      time: '08:40',
      paragraphs: [
        'Does a bigger context window actually help once retrieval is good? Kestrel, design it.'
      ]
    },
    {
      kind: 'message',
      id: 'b2',
      author: 'Kestrel',
      initials: 'K',
      color: '#4ec98a',
      tag: 'analyst',
      time: '08:52',
      paragraphs: [
        'Factorial over window and depth. The catch is they are confounded through total tokens.'
      ],
      docId: 'ablation-design'
    },
    {
      kind: 'message',
      id: 'b4',
      author: 'Kestrel',
      initials: 'K',
      color: '#4ec98a',
      tag: 'analyst',
      time: '09:31',
      paragraphs: [
        'Running sweep at n=8 with the token budget held fixed. First cells land in ~20 min.'
      ]
    }
  ],
  activity: [
    {
      id: 'g1',
      label: '08:55 · Kestrel',
      steps: [
        {
          id: 'bs1',
          state: 'ok',
          name: 'skill_read',
          detail: 'ablation-planner',
          duration: '0.1s'
        },
        {
          id: 'bs2',
          state: 'ok',
          name: 'write_doc',
          detail: 'ablation-design.md',
          duration: '0.5s'
        },
        {
          id: 'bs3',
          state: 'run',
          name: 'run_sweep',
          detail: 'window × depth, n=8',
          duration: 'running'
        }
      ]
    }
  ],
  docIds: ['ablation-design']
};

const sparse: Thread = {
  id: 'sparse-attention',
  name: 'Survey — sparse attention',
  group: 'Recent',
  live: false,
  preview: 'Wren: 22 papers clustered.',
  participants: [
    { initials: 'O', color: '#7aa2ff' },
    { initials: 'W', color: '#e8785d' }
  ],
  entries: [
    {
      kind: 'message',
      id: 'c1',
      author: 'Wren',
      initials: 'W',
      color: '#e8785d',
      tag: 'researcher',
      time: 'Yesterday',
      paragraphs: [
        '22 papers clustered into four families. Most reported speedups do not survive a fair wall-clock comparison.'
      ],
      docId: 'sparse-attention-survey'
    }
  ],
  activity: [
    {
      id: 'g1',
      label: 'Yesterday · Wren',
      steps: [
        {
          id: 'cs1',
          state: 'ok',
          name: 'web_search',
          detail: '"sparse attention survey"',
          duration: '1.1s'
        },
        {
          id: 'cs2',
          state: 'ok',
          name: 'write_doc',
          detail: 'sparse-attention-survey.md',
          duration: '0.7s'
        }
      ]
    }
  ],
  docIds: ['sparse-attention-survey']
};

const licensing: Thread = {
  id: 'licensing',
  name: 'Dataset licensing audit',
  group: 'Recent',
  live: false,
  preview: 'Finch: Two are CC-BY-NC.',
  participants: [
    { initials: 'O', color: '#7aa2ff' },
    { initials: 'F', color: '#b47aff' }
  ],
  entries: [
    {
      kind: 'message',
      id: 'd1',
      author: 'Finch',
      initials: 'F',
      color: '#b47aff',
      tag: 'critic',
      time: 'Mon',
      paragraphs: ['Two of the nine are CC-BY-NC. They cannot ship in a commercial artifact.'],
      docId: 'licensing-audit'
    }
  ],
  activity: [
    {
      id: 'g1',
      label: 'Mon · Finch',
      steps: [
        { id: 'ds1', state: 'ok', name: 'skill_read', detail: 'license-check', duration: '0.1s' },
        {
          id: 'ds2',
          state: 'ok',
          name: 'write_doc',
          detail: 'licensing-audit.md',
          duration: '0.4s'
        }
      ]
    }
  ],
  docIds: ['licensing-audit']
};

const repro: Thread = {
  id: 'repro-chen',
  name: 'Repro: Chen et al. 2025',
  group: 'Recent',
  live: false,
  preview: 'Orchestrator: Closing this out.',
  participants: [
    { initials: 'O', color: '#7aa2ff' },
    { initials: 'K', color: '#4ec98a' }
  ],
  entries: [
    {
      kind: 'message',
      id: 'e1',
      author: 'Orchestrator',
      initials: 'O',
      color: '#7aa2ff',
      tag: 'orch',
      isOrchestrator: true,
      time: 'Mon',
      paragraphs: ['Numbers land within 2 points of the paper. Closing this out.']
    }
  ],
  activity: [],
  docIds: []
};

const weekly: Thread = {
  id: 'weekly',
  name: 'Weekly synthesis',
  group: 'Recent',
  live: false,
  preview: 'Orchestrator: Posted summary.',
  participants: [{ initials: 'O', color: '#7aa2ff' }],
  entries: [
    {
      kind: 'message',
      id: 'f1',
      author: 'Orchestrator',
      initials: 'O',
      color: '#7aa2ff',
      tag: 'orch',
      isOrchestrator: true,
      time: 'Mon',
      paragraphs: ['Posted the summary. Ablation is the open front for next week.'],
      docId: 'weekly-synthesis'
    }
  ],
  activity: [],
  docIds: ['weekly-synthesis']
};

export const threads: Thread[] = [retrievalEval, ablation, sparse, licensing, repro, weekly];

export const findThread = (id: string) => threads.find(t => t.id === id);

export const stepCount = (thread: Thread) =>
  thread.activity.reduce((n, g) => n + g.steps.length, 0);
