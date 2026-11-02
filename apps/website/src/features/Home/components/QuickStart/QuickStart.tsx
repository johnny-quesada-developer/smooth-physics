import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import CodeBlock from '@/components/CodeBlock';
import { PACKAGE_NAME } from '@/site/package';
import twMerge from '@/tailwind/twMerge';

type QuickStartProps = ComponentProps<'div'>;

const CODE = `import * as THREE from 'three';
import { createThreeCloth } from '${PACKAGE_NAME}/three';

const cloth = createThreeCloth({
  three: THREE,
  root: model,
  spec: {
    cloths: [{ name: 'hair', bones: [hairRoot], colliders: [0] }],
    colliders: [{ object: head, shape: 'sphere', radius: 0.09 }],
  },
});

renderer.setAnimationLoop(() => {
  const deltaTime = clock.getDelta();

  // Restore before the animation, update after it.
  cloth.restore();
  mixer.update(deltaTime);
  cloth.update({ deltaTime, root: model });

  renderer.render(scene, camera);
});`;

const STEPS: readonly { readonly title: string; readonly text: string }[] = [
  { title: 'Name the root bones', text: 'Each cloth lists its root bones. They stay fixed, and every bone below them becomes a particle.' },
  { title: 'Attach colliders', text: 'Spheres and tapered capsules follow the objects you give them. Each cloth lists the colliders it reacts to.' },
  { title: 'Restore, animate, update', text: 'Three calls per frame, in that order. The cloth needs nothing else scheduled.' },
];

const QuickStart: FC<QuickStartProps> = ({ className, ...props }) => {
  return (
    <div className={twMerge(classNames('QuickStart', 'grid gap-6 lg:grid-cols-5', className))} {...props}>
      <ol className="flex flex-col gap-4 lg:col-span-2">
        {STEPS.map((step, index) => (
          <li className="flex gap-4" key={step.title}>
            <span aria-hidden="true" className="font-mono text-2xl font-semibold text-lime tabular-nums">
              {index + 1}
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{step.title}</span>
              <span className="text-sm text-pretty text-muted">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <CodeBlock caption="main.ts" className="lg:col-span-3" code={CODE} />
    </div>
  );
};

export default QuickStart;
