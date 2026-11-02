import classNames from 'classnames';
import { useEffect, useRef, type ComponentProps, type FC } from 'react';

import ChoiceField from '@/components/ChoiceField';
import RangeField from '@/components/RangeField';
import twMerge from '@/tailwind/twMerge';
import useWall from '../../stores/wallStore';
import WallSession, { type WallThread } from '../../wall/WallSession';
import WorkerWallPlaygroundTestIds from './WorkerWallPlayground.testIds';

type WorkerWallPlaygroundProps = ComponentProps<'div'>;

const THREADS: readonly { readonly value: WallThread; readonly label: string }[] = [
  { value: 'worker', label: 'Worker' },
  { value: 'main', label: 'Main thread' },
];
const NUMBER = new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const LINKS = 14;

const WorkerWallPlayground: FC<WorkerWallPlaygroundProps> = ({ className, ...props }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [{ chains, thread, statistics, problem }, { setChains, setThread, report, fail }] = useWall();

  // A new session for every chain count or thread: the worker and the scene are rebuilt.
  useEffect(() => {
    const host = hostRef.current,
      canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const session = new WallSession({
      canvas,
      host,
      spec: { chains, links: LINKS },
      thread,
      onStatistics: report,
      onProblem: fail,
    });
    return () => session.dispose();
  }, [chains, thread, report, fail]);

  const items: readonly { readonly name: string; readonly label: string; readonly value: string }[] = [
    { name: 'main-thread', label: 'Main thread per frame', value: statistics ? `${NUMBER.format(statistics.mainThreadMilliseconds)} ms` : '–' },
    { name: 'physics', label: 'Physics per frame', value: statistics ? `${NUMBER.format(statistics.physicsMilliseconds)} ms` : '–' },
    { name: 'fps', label: 'Frames', value: statistics ? `${INTEGER.format(statistics.framesPerSecond)} fps` : '–' },
    { name: 'particles', label: 'Particles', value: statistics ? INTEGER.format(statistics.particles) : '–' },
  ];

  return (
    <div
      className={twMerge(classNames('WorkerWallPlayground', 'grid gap-4 lg:grid-cols-3', className))}
      data-testid={WorkerWallPlaygroundTestIds.root}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-2">
        <div className="relative aspect-4/3 overflow-hidden rounded-stage border border-line bg-surface shadow-floating sm:aspect-16/10" ref={hostRef}>
          <canvas
            aria-label="A wall of chains swept by a ball, simulated off the main thread."
            className="block size-full"
            data-testid={WorkerWallPlaygroundTestIds.canvas}
            ref={canvasRef}
            role="img"
          />
          {problem ? (
            <p
              className="absolute inset-x-4 bottom-4 rounded-control bg-surface p-3 text-sm shadow-raised"
              data-testid={WorkerWallPlaygroundTestIds.problem}
              role="status"
            >
              {problem}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-panel border border-line bg-surface p-4 text-sm sm:grid-cols-4">
          {items.map((item) => (
            <div className="flex flex-col" key={item.name}>
              <dt className="text-xs text-muted">{item.label}</dt>
              <dd className="font-mono tabular-nums" data-testid={WorkerWallPlaygroundTestIds.value(item.name)}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 shadow-raised">
        <RangeField
          inputTestId={WorkerWallPlaygroundTestIds.chains}
          label="Chains"
          maximum={160}
          minimum={8}
          onValueChange={setChains}
          step={8}
          value={chains}
        />
        <ChoiceField label="Simulate in" onValueChange={setThread} optionTestId={WorkerWallPlaygroundTestIds.thread} options={THREADS} value={thread} />
        <p className="text-sm text-pretty text-muted">
          In the worker, the main thread only draws. On the main thread, the physics shares the frame with drawing and input.
        </p>
      </div>
    </div>
  );
};

export default WorkerWallPlayground;
