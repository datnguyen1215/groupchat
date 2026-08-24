export type Block =
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'paragraph'; text: string }
	| { type: 'list'; items: string[] }
	| { type: 'quote'; text: string }
	| { type: 'code'; text: string }
	| { type: 'table'; head: string[]; rows: string[][] }
	| { type: 'rule' };

const splitRow = (line: string) =>
	line
		.replace(/^\||\|$/g, '')
		.split('|')
		.map((c) => c.trim());

const isDivider = (line: string) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line);

/** Parses the markdown subset used by the fixture documents into blocks. */
export const parseMarkdown = (source: string): Block[] => {
	const lines = source.split('\n');
	const blocks: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (!line.trim()) {
			i++;
			continue;
		}

		if (line.startsWith('```')) {
			const body: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
			i++;
			blocks.push({ type: 'code', text: body.join('\n') });
			continue;
		}

		const heading = line.match(/^(#{1,3})\s+(.*)$/);
		if (heading) {
			blocks.push({
				type: 'heading',
				level: heading[1].length as 1 | 2 | 3,
				text: heading[2]
			});
			i++;
			continue;
		}

		if (/^---+$/.test(line.trim())) {
			blocks.push({ type: 'rule' });
			i++;
			continue;
		}

		if (line.startsWith('> ')) {
			const body: string[] = [];
			while (i < lines.length && lines[i].startsWith('> ')) body.push(lines[i++].slice(2));
			blocks.push({ type: 'quote', text: body.join(' ') });
			continue;
		}

		if (line.startsWith('- ')) {
			const items: string[] = [];
			while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
			blocks.push({ type: 'list', items });
			continue;
		}

		if (line.startsWith('|') && isDivider(lines[i + 1] ?? '')) {
			const head = splitRow(line);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && lines[i].startsWith('|')) rows.push(splitRow(lines[i++]));
			blocks.push({ type: 'table', head, rows });
			continue;
		}

		const body: string[] = [];
		while (i < lines.length && lines[i].trim() && !/^[#>|`-]/.test(lines[i])) body.push(lines[i++]);
		blocks.push({ type: 'paragraph', text: body.join(' ') });
	}

	return blocks;
};

export type Span = { text: string; bold?: boolean; code?: boolean };

/** Splits inline `code` and **bold** runs. Everything else is literal text. */
export const parseInline = (text: string): Span[] => {
	const spans: Span[] = [];
	const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
	let last = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text))) {
		if (match.index > last) spans.push({ text: text.slice(last, match.index) });
		if (match[1] !== undefined) spans.push({ text: match[1], code: true });
		else spans.push({ text: match[2], bold: true });
		last = pattern.lastIndex;
	}

	if (last < text.length) spans.push({ text: text.slice(last) });
	return spans;
};
