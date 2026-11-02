import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import useStageStatistics from '@/features/Stage/stores/stageStatisticsStore';
import twMerge from '@/tailwind/twMerge';
import StageReadoutTestIds from './StageReadout.testIds';

type StageReadoutProps = ComponentProps<'dl'>;

const NUMBER = new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

const StageReadout: FC<StageReadoutProps> = ({ className, ...props }) => {
  const [statistics] = useStageStatistics();
  const items: readonly { readonly name: string; readonly label: string; readonly value: string }[] = [
    { name: 'physics', label: 'Physics', value: statistics ? `${NUMBER.format(statistics.physicsMilliseconds)} ms` : '–' },
    { name: 'fps', label: 'Frames', value: statistics ? `${INTEGER.format(statistics.framesPerSecond)} fps` : '–' },
    { name: 'particles', label: 'Particles', value: statistics ? INTEGER.format(statistics.particles) : '–' },
    { name: 'steps', label: 'Steps per frame', value: statistics ? INTEGER.format(statistics.stepsPerFrame) : '–' },
    { name: 'contacts', label: 'Contacts', value: statistics ? INTEGER.format(statistics.contacts) : '–' },
    { name: 'rate', label: 'Rate', value: statistics ? `${INTEGER.format(statistics.frequency)} Hz ${statistics.precision}` : '–' },
    { name: 'quality', label: 'Quality', value: statistics ? statistics.quality : '–' },
  ];
  return (
    <dl
      className={twMerge(classNames('StageReadout', 'grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4', className))}
      data-testid={StageReadoutTestIds.root}
      {...props}
    >
      {items.map((item) => (
        <div className="flex flex-col" key={item.name}>
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="font-mono tabular-nums" data-testid={StageReadoutTestIds.value(item.name)}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default StageReadout;
