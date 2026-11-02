import classNames from 'classnames';
import type { ComponentProps, FC, ReactNode } from 'react';

import Badge from '@/components/Badge';
import CodeBlock from '@/components/CodeBlock';
import Container from '@/components/Container';
import twMerge from '@/tailwind/twMerge';
import type { Example } from '../../catalogue/types';
import ExamplePageTestIds from './ExamplePage.testIds';
import { sitePath } from '@/site/paths';

export type GuideLink = { readonly slug: string; readonly title: string; readonly href: string };

type ExamplePageProps = ComponentProps<'main'> & {
  readonly example: Example;
  // Documentation pages about what the example shows.
  readonly guides: readonly GuideLink[];
  readonly children: ReactNode;
};

const ExamplePage: FC<ExamplePageProps> = ({ className, example, guides, children, ...props }) => {
  return (
    <main className={twMerge(classNames('ExamplePage', 'flex flex-col gap-10 py-10', className))} data-testid={ExamplePageTestIds.root} id="content" {...props}>
      <Container className="flex flex-col gap-4">
        <a className="flex min-h-touch w-fit items-center text-sm font-medium text-muted hover:text-ink" href={sitePath('/examples/')}>
          ← All examples
        </a>
        <div className="flex flex-wrap gap-2">
          {example.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <h1 className="text-title font-semibold text-balance" data-testid={ExamplePageTestIds.title}>
          {example.title}
        </h1>
        <p className="max-w-3xl text-lg text-pretty text-muted">{example.summary}</p>
      </Container>
      <Container>{children}</Container>
      <Container className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4 text-pretty">
          <h2 className="text-xl font-semibold">How it works</h2>
          {example.description.map((paragraph) => (
            <p className="text-muted" key={paragraph}>
              {paragraph}
            </p>
          ))}
          {guides.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">In the documentation</h3>
              {guides.map((guide) => (
                <a
                  className="flex min-h-touch items-center font-medium text-lime underline decoration-1 underline-offset-4 hover:decoration-2"
                  data-testid={ExamplePageTestIds.guide(guide.slug)}
                  href={guide.href}
                  key={guide.slug}
                >
                  {guide.title}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <CodeBlock caption="The setup in this example" code={example.code} data-testid={ExamplePageTestIds.code} />
      </Container>
    </main>
  );
};

export default ExamplePage;
