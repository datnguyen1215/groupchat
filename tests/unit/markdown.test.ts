import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '../../src/lib/markdown';

/**
 * The parser renders document and skill bodies. It handles a deliberate subset,
 * so these pin both what it supports and how it degrades on the rest.
 */

describe('parseMarkdown', () => {
  it('returns nothing for empty or blank input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n   \n')).toEqual([]);
  });

  it.each([
    ['# One', 1],
    ['## Two', 2],
    ['### Three', 3]
  ])('reads %s as a level-%i heading', (source, level) => {
    expect(parseMarkdown(source)).toEqual([
      { type: 'heading', level, text: source.replace(/^#+\s/, '') }
    ]);
  });

  it('does not treat a fourth hash level as a heading', () => {
    /* The subset stops at three; deeper hashes fall through to a paragraph. */
    const [block] = parseMarkdown('#### Four');

    expect(block.type).not.toBe('heading');
  });

  it('joins wrapped lines into one paragraph', () => {
    expect(parseMarkdown('one\ntwo\nthree')).toEqual([
      { type: 'paragraph', text: 'one two three' }
    ]);
  });

  it('separates paragraphs on a blank line', () => {
    expect(parseMarkdown('first\n\nsecond')).toEqual([
      { type: 'paragraph', text: 'first' },
      { type: 'paragraph', text: 'second' }
    ]);
  });

  it('collects consecutive bullets into one list', () => {
    expect(parseMarkdown('- a\n- b\n- c')).toEqual([{ type: 'list', items: ['a', 'b', 'c'] }]);
  });

  it('joins a multi-line quote into one block', () => {
    expect(parseMarkdown('> one\n> two')).toEqual([{ type: 'quote', text: 'one two' }]);
  });

  it('keeps code fences verbatim, including blank lines', () => {
    const source = '```\nconst a = 1;\n\nconst b = 2;\n```';

    expect(parseMarkdown(source)).toEqual([{ type: 'code', text: 'const a = 1;\n\nconst b = 2;' }]);
  });

  it('does not parse markdown inside a fence', () => {
    /* A `# heading` in a code block is code, not a heading. */
    expect(parseMarkdown('```\n# not a heading\n- not a list\n```')).toEqual([
      { type: 'code', text: '# not a heading\n- not a list' }
    ]);
  });

  it('reads a table with its header and rows', () => {
    const source = '| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';

    expect(parseMarkdown(source)).toEqual([
      {
        type: 'table',
        head: ['a', 'b'],
        rows: [
          ['1', '2'],
          ['3', '4']
        ]
      }
    ]);
  });

  it('needs the divider row to read a table', () => {
    /* Without it the pipes are just text. */
    const [block] = parseMarkdown('| a | b |\n| 1 | 2 |');

    expect(block.type).not.toBe('table');
  });

  it('reads a horizontal rule', () => {
    expect(parseMarkdown('---')).toEqual([{ type: 'rule' }]);
  });

  it('keeps blocks in source order', () => {
    const source = '# Title\n\nIntro line.\n\n- one\n- two\n\n> quoted';

    expect(parseMarkdown(source).map(b => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'quote'
    ]);
  });

  it('terminates on an unclosed code fence', () => {
    /* A missing closing fence must not spin the while loop. */
    expect(parseMarkdown('```\nunclosed')).toEqual([{ type: 'code', text: 'unclosed' }]);
  });
});

describe('parseInline', () => {
  it('returns one literal span when there is no markup', () => {
    expect(parseInline('plain text')).toEqual([{ text: 'plain text' }]);
  });

  it('marks a code run', () => {
    expect(parseInline('use `npm run dev` now')).toEqual([
      { text: 'use ' },
      { text: 'npm run dev', code: true },
      { text: ' now' }
    ]);
  });

  it('marks a bold run', () => {
    expect(parseInline('be **very** clear')).toEqual([
      { text: 'be ' },
      { text: 'very', bold: true },
      { text: ' clear' }
    ]);
  });

  it('handles several runs in one line', () => {
    expect(parseInline('`a` and **b**')).toEqual([
      { text: 'a', code: true },
      { text: ' and ' },
      { text: 'b', bold: true }
    ]);
  });

  it('leaves an unclosed marker as literal text', () => {
    expect(parseInline('an `unclosed run')).toEqual([{ text: 'an `unclosed run' }]);
  });

  it('returns nothing for an empty string', () => {
    expect(parseInline('')).toEqual([]);
  });
});

/**
 * Chat messages arrive as paragraphs and are joined before parsing, so a list
 * an agent wrote across several paragraphs still parses as one list.
 */
describe('chat messages parse as markdown', () => {
  it('turns a run of dashed lines into one list', () => {
    const blocks = parseMarkdown(['Three problems:', '- one\n- two\n- three'].join('\n\n'));
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Three problems:' },
      { type: 'list', items: ['one', 'two', 'three'] }
    ]);
  });

  it('leaves ordinary prose as paragraphs', () => {
    const blocks = parseMarkdown(['First point.', 'Second point.'].join('\n\n'));
    expect(blocks.every(b => b.type === 'paragraph')).toBe(true);
  });

  it('keeps a dash inside a sentence out of a list', () => {
    const blocks = parseMarkdown('recall@k - the honest metric');
    expect(blocks[0].type).toBe('paragraph');
  });
});
