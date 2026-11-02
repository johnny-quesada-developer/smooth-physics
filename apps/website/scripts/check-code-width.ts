// Fails when a code sample the site shows has a line wider than 120 characters: the template-literal `code:` strings
// of the examples catalogue, the landing page's code constants and the fenced code blocks of the Markdown content.
// Usage: vpx scripts/check-code-width.ts
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_NAME } from '../src/site/package';

const MAXIMUM_COLUMNS = 120;
const APP = fileURLToPath(new URL('..', import.meta.url));

// Template literals that hold a sample: a `code:` property, or a constant named CODE or ending in _CODE.
const TEMPLATE_SOURCES: readonly { readonly directory: string; readonly extensions: readonly string[] }[] = [
  { directory: 'src/features/Examples/catalogue', extensions: ['.ts'] },
  { directory: 'src/features/Home', extensions: ['.ts', '.tsx'] },
];
const MARKDOWN_DIRECTORY = 'src/content';
const SAMPLE_START = /(?:\bcode\s*:|\b(?:[A-Z][A-Z0-9_]*_)?CODE\s*=)\s*`/g;
// The interpolations a sample may use, by the value they render as.
const INTERPOLATIONS: Readonly<Record<string, string>> = { PACKAGE_NAME };
// Characters as a reader counts them, so an accented letter or an emoji is one.
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

type Line = { readonly file: string; readonly line: number; readonly text: string };

const samples: Line[][] = [
  ...TEMPLATE_SOURCES.flatMap(({ directory, extensions }) =>
    filesIn(directory)
      .filter((file) => extensions.includes(extname(file)))
      .flatMap((file) => templateSamples(file)),
  ),
  ...filesIn(MARKDOWN_DIRECTORY)
    .filter((file) => ['.md', '.mdx'].includes(extname(file)))
    .flatMap((file) => fencedSamples(file)),
];
if (!samples.some((sample) => sample[0]?.file.startsWith(TEMPLATE_SOURCES[0]?.directory ?? '-'))) {
  throw new Error(`No code sample was found in ${TEMPLATE_SOURCES[0]?.directory}: the pattern no longer matches the catalogue.`);
}

const wide = samples.flat().filter((line) => widthOf(line.text) > MAXIMUM_COLUMNS);
for (const line of wide) console.error(`${line.file}:${line.line}: ${widthOf(line.text)} characters, over ${MAXIMUM_COLUMNS}`);
if (wide.length) {
  console.error(`${wide.length} code sample line${wide.length === 1 ? ' is' : 's are'} wider than ${MAXIMUM_COLUMNS} characters.`);
  process.exit(1);
}
console.info(`All ${samples.length} code samples fit in ${MAXIMUM_COLUMNS} characters.`);

function widthOf(text: string): number {
  let width = 0;
  for (const _ of GRAPHEMES.segment(text)) width++;
  return width;
}

// Paths relative to the app, sorted, so the report reads the same on every run.
function filesIn(directory: string): string[] {
  return readdirSync(join(APP, directory), { recursive: true, encoding: 'utf8' })
    .map((file) => join(directory, file))
    .toSorted();
}

// Each sample as the lines the page renders, numbered by the source line they come from.
function templateSamples(file: string): Line[][] {
  const source = readFileSync(join(APP, file), 'utf8');
  return [...source.matchAll(SAMPLE_START)].map((match) => {
    const start = (match.index ?? 0) + match[0].length;
    const firstLine = source.slice(0, start).split('\n').length;
    return renderTemplate({ source, start, file })
      .split('\n')
      .map((text, index) => ({ file, line: firstLine + index, text }));
  });
}

// The text of the template literal that starts at `start`, with escapes resolved and known interpolations filled in.
function renderTemplate({ source, start, file }: { source: string; start: number; file: string }): string {
  let text = '';
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (character === '`') return text;
    if (character === '\\') {
      text += source[++index] ?? '';
      continue;
    }
    if (character === '$' && source[index + 1] === '{') {
      const end = source.indexOf('}', index);
      if (end < 0) break;
      const expression = source.slice(index + 2, end).trim();
      const value = INTERPOLATIONS[expression];
      if (value === undefined) throw new Error(`${file}: the sample interpolates \${${expression}}, whose rendered width is unknown.`);
      text += value;
      index = end;
      continue;
    }
    text += character;
  }
  throw new Error(`${file}: a code sample's template literal never closes.`);
}

// Fenced code blocks, measured from the fence's own indentation, as Markdown renders a block inside a list item.
function fencedSamples(file: string): Line[][] {
  const blocks: Line[][] = [];
  let open: { readonly fence: string; readonly indent: RegExp; readonly lines: Line[] } | null = null;
  for (const [index, text] of readFileSync(join(APP, file), 'utf8').split('\n').entries()) {
    const fence = /^( *)(`{3,}|~{3,})/.exec(text);
    if (!open) {
      if (fence) open = { fence: fence[2] ?? '```', indent: new RegExp(`^ {0,${fence[1]?.length ?? 0}}`), lines: [] };
      continue;
    }
    if (fence?.[2]?.startsWith(open.fence) && text.trim() === fence[2]) {
      blocks.push(open.lines);
      open = null;
      continue;
    }
    open.lines.push({ file, line: index + 1, text: text.replace(open.indent, '') });
  }
  if (open) throw new Error(`${file}: a fenced code block never closes.`);
  return blocks;
}
