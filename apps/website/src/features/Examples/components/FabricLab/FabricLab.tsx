import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import Button from '@/components/Button';
import twMerge from '@/tailwind/twMerge';
import useFabricLab, { MAXIMUM_PANELS } from '../../stores/fabricLabStore';
import FabricSwatchContext, { swatchStateOf } from '../../stores/fabricSwatchContext';
import FabricSwatchPanel from '../FabricSwatchPanel';
import FabricLabTestIds from './FabricLab.testIds';

type FabricLabProps = ComponentProps<'div'>;

const FabricLab: FC<FabricLabProps> = ({ className, ...props }) => {
  const [{ panels }, { addPanel, removePanel }] = useFabricLab();
  return (
    <div className={twMerge(classNames('FabricLab', 'flex flex-col gap-4', className))} data-testid={FabricLabTestIds.root} {...props}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {panels.map((panel) => (
          <FabricSwatchContext.Provider key={panel.id} value={swatchStateOf(panel.preset)}>
            <FabricSwatchPanel canRemove={panels.length > 1} onRemove={() => removePanel(panel.id)} panelId={panel.id} />
          </FabricSwatchContext.Provider>
        ))}
      </div>
      <Button className="w-fit" data-testid={FabricLabTestIds.add} disabled={panels.length >= MAXIMUM_PANELS} onClick={() => addPanel()} tone="primary">
        Add a swatch ({panels.length} of {MAXIMUM_PANELS})
      </Button>
    </div>
  );
};

export default FabricLab;
