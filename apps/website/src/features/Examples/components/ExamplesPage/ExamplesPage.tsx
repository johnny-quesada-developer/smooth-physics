import classNames from 'classnames';
import type { ComponentProps, FC, ReactNode } from 'react';

import Container from '@/components/Container';
import SectionHeading from '@/components/SectionHeading';
import twMerge from '@/tailwind/twMerge';

type ExamplesPageProps = ComponentProps<'main'> & {
  readonly children: ReactNode;
};

const ExamplesPage: FC<ExamplesPageProps> = ({ className, children, ...props }) => {
  return (
    <main className={twMerge(classNames('ExamplesPage', 'py-12', className))} id="content" {...props}>
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow="Examples" level="h1" title="Explore the examples">
          <p>
            Search the examples and the documentation by what you are building, such as a cape, a flag or a robe, or by the setting you want to understand.
            Results update as you type and tolerate typos, and the filters narrow the list.
          </p>
        </SectionHeading>
        {children}
      </Container>
    </main>
  );
};

export default ExamplesPage;
