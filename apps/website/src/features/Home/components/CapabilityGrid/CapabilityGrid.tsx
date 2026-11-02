import classNames from 'classnames';
import type { ComponentProps, FC, ReactNode } from 'react';

import { PACKAGE_NAME } from '@/site/package';
import twMerge from '@/tailwind/twMerge';
import CapabilityGridTestIds from './CapabilityGrid.testIds';

type CapabilityGridProps = ComponentProps<'ul'>;

type Capability = { readonly name: string; readonly area: string; readonly title: string; readonly text: ReactNode };

const Code: FC<{ readonly children: ReactNode }> = ({ children }) => <code className="font-mono text-[0.92em] text-ink">{children}</code>;

const CAPABILITIES: readonly Capability[] = [
  {
    name: 'engines',
    area: 'Integration',
    title: 'Any engine, exact coordinates',
    text: 'The core takes and returns poses in your engine’s own convention: left- or right-handed, Y or Z up. Conversion only reorders and negates numbers, so it is exact.',
  },
  {
    name: 'three',
    area: 'three.js',
    title: 'Adapter included',
    text: (
      <>
        <Code>createThreeCloth</Code> from <Code>{PACKAGE_NAME}/three</Code> reads the bones and colliders of a model and writes the motion back, optimized like
        the solver. Apps without three.js never load it.
      </>
    ),
  },
  {
    name: 'determinism',
    area: 'Determinism',
    title: 'Same input, same output',
    text: 'In one JavaScript engine on one processor architecture, a given input produces the same result bit for bit, so replays and automated tests match frame for frame.',
  },
  {
    name: 'budget',
    area: 'Performance',
    title: 'Holds a frame budget',
    text: 'The optional quality controller measures physics time and lowers the simulation rate, then the steps per frame, to stay within your budget. It restores them when there is room.',
  },
  {
    name: 'worker',
    area: 'Threads',
    title: 'Runs in a Web Worker',
    text: 'The core never touches the DOM, so the simulation can run off the main thread and leave the page free for input and rendering. The banner below runs that way.',
  },
  {
    name: 'colliders',
    area: 'Collision',
    title: 'Colliders with friction',
    text: 'Spheres and tapered capsules follow any object. Point contact is the fast default; edge contact also tests the segments between particles, so a collider cannot slip between strands.',
  },
  {
    name: 'stability',
    area: 'Stability',
    title: 'Composed under fast motion',
    text: 'World and local inertia, speed limits and teleport handling keep cloth under control through sprints, spins and sudden jumps of the character.',
  },
  {
    name: 'tuning',
    area: 'Workflow',
    title: 'Live tuning',
    text: 'Change any setting on a running cloth without a reset. The particles keep their motion, so editor sliders respond continuously.',
  },
  {
    name: 'validation',
    area: 'Reliability',
    title: 'Strict validation, typed errors',
    text: (
      <>
        Every input is validated once. A call does what it was asked or throws a <Code>SmoothPhysicsError</Code> with a code and the location of the first
        problem.
      </>
    ),
  },
];

const CapabilityGrid: FC<CapabilityGridProps> = ({ className, ...props }) => {
  return (
    <ul
      className={twMerge(classNames('CapabilityGrid', 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className))}
      data-testid={CapabilityGridTestIds.root}
      {...props}
    >
      {CAPABILITIES.map((capability) => (
        <li
          className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-5"
          data-testid={CapabilityGridTestIds.item(capability.name)}
          key={capability.name}
        >
          <span className="font-mono text-xs tracking-wide text-lime uppercase">{capability.area}</span>
          <h3 className="text-base font-semibold">{capability.title}</h3>
          <p className="text-sm text-pretty text-muted">{capability.text}</p>
        </li>
      ))}
    </ul>
  );
};

export default CapabilityGrid;
