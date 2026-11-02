---
title: Performance and quality
nav: Performance
lead: Keep physics inside a frame budget with the simulation rate, the steps per frame, the precision and the quality controller.
section: guides
order: 1
kind: guide
example: banner-field
tags:
  [
    performance,
    precision,
    rounded,
    default,
    frequency,
    rate,
    steps,
    maxStepsPerFrame,
    autoRate,
    budget,
    quality,
    low power,
    frameCap30,
    worker,
    stats,
    motion boost,
  ]
features: [performance, rate, workers]
---

Physics time grows with the particles, the steps per second and the colliders. On a slow phone, or with many cloths, it can take more of the frame than you can spare. Measure first, then trade rate for time, and let the quality controller do it while the app runs.

## Measure

`system.stats.frameMs` is the physics time of the last update, in milliseconds. Average it over a second or so before you decide anything: the first seconds include JIT warm-up.

```ts
cloth.update({ deltaTime, root: scene });
const { frameMs, steps, particles, contacts } = cloth.system.stats;
```

## Rate and steps

The solver runs at a fixed rate, 90 Hz by default, and each update runs the steps that are due. At 60 frames a second that is one or two steps a frame.

| Change                | Effect                                                           |
| --------------------- | ---------------------------------------------------------------- |
| `setFrequency(60)`    | About a third less physics time. Less steady for fast motion.    |
| `setFrequency(120)`   | Steadier for fast motion, at a third more physics time.          |
| `maxStepsPerFrame: 2` | Caps the cost of a slow frame. Steps beyond the cap are dropped. |

```ts
const cloth = createThreeCloth({ three: THREE, root: model, spec, options: { frequency: 60, maxStepsPerFrame: 2 } });
cloth.system.setFrequency(120); // later, while it runs
```

Stiffness and damping are scaled with the rate, so a cloth behaves alike at every rate.

## Precision

```ts
cloth.system.setPrecision('rounded');
```

- `'default'` runs in 64-bit numbers. It is the fastest choice and what a new system uses.
- `'rounded'` rounds every operation to 32 bits. It repeats recorded runs bit for bit, and it is slower.

In one JavaScript engine, the same input always gives the same output in either precision. Engines may compute `Math.sin`, `Math.cos`, `Math.acos` and `Math.pow` slightly differently, so neither precision promises the same result in different browsers.

## The quality controller

`system.autoRate` keeps physics inside a time budget. It is off by default.

```ts
const system = cloth.system;

system.autoRate.enabled = true;
system.autoRate.budgetMs = 6;

const stop = system.onQualityChange((change) => {
  console.info(change.previous, '→', change.level, change.reason);
});
```

- Over budget, it lowers the rate (150, 120, 90, 60, 45 or 30 Hz, never above the starting rate), then the steps per frame.
- With room to spare, it raises the steps, then the rate. It waits 0.4 seconds between steps down and 2 seconds before a step up, so it does not oscillate.
- It changes nothing during the first 2 seconds, while the engine warms up.
- The level is `'full'`, `'reduced'` or `'minimum'`. `system.quality` holds the current one.
- With `autoRate.precision = true`, a system set to `'rounded'` switches to `'default'` while its steps are slow, and back when there is room.

`system.quality.frameCap30` is true when frames arrive at a steady 30 fps, which iOS Low Power Mode causes. You can show a note, or lower other costs.

## Motion boost

Fast collider motion needs a higher rate to stay inside the cloth. `autoRate.motionBoost` keeps at least `frequency` Hz while a collider moves faster than `speed` m/s, and for `holdMs` after, and cuts steps per frame instead. It works only while the controller is on.

```ts
system.autoRate.motionBoost.mode = 'free';
```

- `'off'` (default) never boosts.
- `'free'` boosts only when the frame already runs its maximum steps, so the higher rate adds no steps.
- `'always'` boosts whenever colliders move fast.
- `system.requestMotionBoost(holdMs)` asks for a boost yourself, for example before a jump. It needs a mode other than `'off'`.

## Move the solver to a worker

The core does not touch the DOM or three.js, so it runs in a Web Worker. The main thread then only sends poses and draws results. This pays off with many cloths, or when the main thread is busy with other work. See [Any engine and Web Workers](../engines-and-workers/).

## Try it

The [field of banners](../../examples/banner-field/) runs up to 48 flags: compare the precisions, change the budget and watch the controller move the rate.
