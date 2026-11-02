---
title: Live tuning
lead: Connect sliders to a running cloth with tuneCloth, so a change applies at once and the cloth keeps moving.
section: guides
order: 3
kind: guide
example: fabric-lab
tags: [live tuning, tuneCloth, sliders, controls, settings panel, retune, rebuild, validation, setCustomValidity]
features: [tuning, state]
---

Building a cloth again for every change restarts its motion, so a slider feels jumpy. `tuneCloth` changes the settings of a running cloth in place: its particles keep moving, and only what you pass changes.

## Connect a slider

<div class="code-title">controls.ts</div>

```ts
import { tuneCloth } from 'smooth-physics';

const [simulation] = cloth.simulations;
const gravity = document.querySelector<HTMLInputElement>('#gravity')!;

gravity.value = String(simulation.settings.gravity);
gravity.addEventListener('input', () => {
  tuneCloth({ simulation, settings: { gravity: gravity.valueAsNumber } });
});
```

`simulation.settings` holds the resolved settings, so it gives each control its starting value.

## Find a cloth by name

With several cloths, look each one up by the `name` in its spec.

```ts
const byName = new Map(cloth.simulations.map((simulation) => [simulation.name, simulation]));

tuneCloth({ simulation: byName.get('cape')!, settings: { damping: [0.05, 0.2] } });
```

## Sort controls by how they apply

Not every control is a setting. Decide for each one how its change applies.

| Control                                               | Apply it with                                     |
| ----------------------------------------------------- | ------------------------------------------------- |
| Gravity, damping, stiffness, bending, limits, contact | `tuneCloth`                                       |
| Simulation rate, precision, frame budget              | `setFrequency`, `setPrecision`, `system.autoRate` |
| Wind, a push                                          | `addForce`, every frame or once                   |
| Collider and anchor motion                            | Move the objects; the cloth reads them each frame |
| Connection, roots, the colliders a cloth uses         | Build the cloth again                             |

The examples on this site follow the same split: each control is marked as tuning, setup or live.

## Show invalid input

`tuneCloth` throws a `SmoothPhysicsError` for an unknown setting or a value out of range, and the cloth keeps its settings. Catch it where the person can fix the value.

```ts
import { SmoothPhysicsError, tuneCloth } from 'smooth-physics';

try {
  tuneCloth({ simulation, settings: { damping: Number(field.value) } });
  field.setCustomValidity('');
} catch (error) {
  if (!(error instanceof SmoothPhysicsError)) throw error;
  field.setCustomValidity(error.message);
  field.reportValidity();
}
```

## One panel per cloth

Each simulation keeps its own settings, so a page can give every cloth its own panel and state. The fabric lab keeps one store per swatch, so changing silk leaves linen and felt alone.

## Try it

- [Fabric lab](../../examples/fabric-lab/): silk, linen and felt side by side, each tuned on its own.

- [Hanging chains](../../examples/hanging-chains/): gravity, damping and stiffness change while the chains swing.
