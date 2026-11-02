import classNames from 'classnames';
import type { ComponentProps, FC, ReactNode } from 'react';

import ButtonLink from '@/components/ButtonLink';
import Container from '@/components/Container';
import SectionHeading from '@/components/SectionHeading';
import ExampleCard from '@/features/Examples/components/ExampleCard';
import type { Example } from '@/features/Examples/catalogue/types';
import { PACKAGE_NAME } from '@/site/package';
import twMerge from '@/tailwind/twMerge';
import AuthorCard from '../AuthorCard';
import CapabilityGrid from '../CapabilityGrid';
import QuickStart from '../QuickStart';
import HomePageTestIds from './HomePage.testIds';
import { sitePath } from '@/site/paths';

type HomePageProps = ComponentProps<'main'> & {
  readonly examples: readonly Example[];
  // The install command island, passed from Astro as the slot named install.
  readonly install?: ReactNode;
  // The live banner island, passed from Astro as the slot named banner.
  readonly banner?: ReactNode;
  // The showreel island.
  readonly children: ReactNode;
};

const DOCS_START = sitePath('/docs/getting-started/');

const HomePage: FC<HomePageProps> = ({ className, examples, install, banner, children, ...props }) => {
  return (
    <main className={twMerge(classNames('HomePage', 'flex flex-col gap-24 pb-24', className))} data-testid={HomePageTestIds.root} id="content" {...props}>
      {/* Compact, so the showreel starts in the first screen on a phone and shows whole on a laptop. */}
      <section className="overflow-hidden border-b border-line">
        <Container className="flex flex-col items-center gap-4 pt-6 pb-12 text-center sm:gap-5 sm:pt-8">
          <h1 className="text-display font-semibold text-balance" data-testid={HomePageTestIds.title}>
            <span className="block md:inline">Real-time cloth and hair</span> <span className="text-sage">for character rigs.</span>
          </h1>
          <p className="hidden max-w-2xl text-lg text-pretty text-muted sm:block" data-testid={HomePageTestIds.subhead}>
            Cloth, hair, tails and ribbons simulated on the bones your model already has. Works with any 3D engine; a three.js adapter is included.
          </p>
          <div className="flex justify-center gap-3">
            <ButtonLink className="sm:px-6 sm:text-base" data-testid={HomePageTestIds.learn} href={DOCS_START} tone="primary">
              Get started <span aria-hidden="true">→</span>
            </ButtonLink>
            <ButtonLink className="sm:px-6 sm:text-base" data-testid={HomePageTestIds.explore} href={sitePath('/examples/')} tone="secondary">
              View the examples
            </ButtonLink>
          </div>
          <div className="mt-1 w-full max-w-5xl text-left">{children}</div>
          <div className="w-full max-w-md">{install}</div>
        </Container>
      </section>

      <Container className="flex flex-col gap-10" data-testid={HomePageTestIds.capabilities}>
        <SectionHeading eyebrow="Capabilities" title="Built for characters in production">
          <p>
            Secondary motion is the movement a body passes on to what it wears and carries. {PACKAGE_NAME} computes it every frame from the pose your animation
            produces, so none of it has to be keyed by hand.
          </p>
          <p className="mt-3">It is dedicated to soft secondary motion. Rigid bodies belong to a rigid-body engine, which can run alongside it.</p>
        </SectionHeading>
        <CapabilityGrid />
      </Container>

      <Container className="flex flex-col gap-10" data-testid={HomePageTestIds.banner}>
        <SectionHeading eyebrow="Interaction" title="Drag a collider through the cloth">
          <p>
            Grab the ball and pull it through the banner, as fast as you like. The cloth collides with it at every simulation step, folds around it and swings
            back when you let go. The physics runs in a Web Worker, so the page stays free for input and drawing.
          </p>
        </SectionHeading>
        {banner}
      </Container>

      <Container className="flex flex-col gap-10" data-testid={HomePageTestIds.examples}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="Examples" title="Every feature, running live">
            <p>
              Each example is a live scene with its setup code alongside. Orbit the camera, drag the moving props through the cloth and change any control: the
              simulation responds on the next frame, without a reset.
            </p>
          </SectionHeading>
          <ButtonLink href={sitePath('/examples/')} tone="quiet">
            Search all examples <span aria-hidden="true">→</span>
          </ButtonLink>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {examples.map((example) => (
            <li className="flex" key={example.slug}>
              <ExampleCard className="w-full" example={example} />
            </li>
          ))}
        </ul>
      </Container>

      <Container className="flex flex-col gap-10" data-testid={HomePageTestIds.quickStart}>
        <SectionHeading eyebrow="Quick start" title="Three calls per frame">
          <p>Describe the cloth once. Then, every frame, restore the rest pose, run your animation and update the cloth.</p>
        </SectionHeading>
        <QuickStart />
      </Container>

      <Container data-testid={HomePageTestIds.docs}>
        <div className="flex flex-col gap-6 rounded-stage border border-line bg-surface p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Documentation" title="From the first cloth to production tuning">
            <p>
              Start with a cloth on screen in a few minutes. Then go deeper with the core concepts, guides for performance, Web Workers and other engines, and
              the API reference.
            </p>
          </SectionHeading>
          <ButtonLink className="w-fit shrink-0" data-testid={HomePageTestIds.docsLink} href={DOCS_START} size="large" tone="primary">
            Read the documentation <span aria-hidden="true">→</span>
          </ButtonLink>
        </div>
      </Container>

      <Container>
        <AuthorCard />
      </Container>
    </main>
  );
};

export default HomePage;
