import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import tsx from 'shiki/langs/tsx.mjs';
import darkPlus from 'shiki/themes/dark-plus.mjs';
import lightPlus from 'shiki/themes/light-plus.mjs';

import twMerge from '@/tailwind/twMerge';

type CodeBlockProps = ComponentProps<'figure'> & { readonly code: string; readonly caption?: string };

// Pages are rendered at build time, so code is highlighted there, with the tutorials' themes; no highlighter ships to
// the browser. The astro-code class picks the light or dark colors like the tutorials' Markdown code.
const highlighter = createHighlighterCoreSync({ themes: [lightPlus, darkPlus], langs: [tsx], engine: createJavaScriptRegexEngine() });

const highlight = (code: string): string =>
  highlighter.codeToHtml(code, {
    lang: 'tsx',
    themes: { light: 'light-plus', dark: 'dark-plus' },
    defaultColor: false,
    transformers: [
      {
        pre(node) {
          this.addClassToHast(node, 'astro-code overflow-x-auto p-4 font-mono text-sm leading-relaxed');
        },
      },
    ],
  });

const CodeBlock: FC<CodeBlockProps> = ({ className, code, caption, ...props }) => {
  return (
    <figure
      className={twMerge(classNames('CodeBlock', 'flex min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-soft', className))}
      {...props}
    >
      {caption ? <figcaption className="border-b border-line px-4 py-2 font-mono text-xs text-muted">{caption}</figcaption> : null}
      <div dangerouslySetInnerHTML={{ __html: highlight(code) }} />
    </figure>
  );
};

export default CodeBlock;
