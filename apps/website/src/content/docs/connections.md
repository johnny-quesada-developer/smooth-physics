---
title: Connections
lead: The connection decides which particles are joined, turning separate chains into strings, a surface or a closed ring.
section: concepts
order: 2
kind: concept
example: curtain
tags: [connection, chains, nearest, strip, ring, surface, triangles, bending, bendingStiffness, curtain, cape, robe, sleeve]
features: [connections, bending]
---

Every cloth has a `connection`. It is set when the cloth is built and does not change while it runs.

## The four connections

| Connection         | Joins                                                         | Good for                                    |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------- |
| `chains` (default) | Each bone to its parent                                       | Chains, hair strands, ribbons, fringe       |
| `nearest`          | Neighbouring chains by distance, with triangles between them  | Curtains, flags, capes                      |
| `strip`            | Chains in the order of the roots, with triangles between them | Surfaces whose chains are not evenly spaced |
| `ring`             | Like `strip`, and the last chain to the first                 | Robes, skirts and sleeves                   |

```ts
cloths: [
  { name: 'curtain', bones: curtainRoots, anchor: rail, connection: 'nearest' },
  { name: 'robe', bones: robeRoots, anchor: hips, connection: 'ring', normals: 'outward' },
];
```

- `nearest` orders the chains itself, walking from each root to the nearest one left. When the two ends of that walk lie close together, it closes the surface into a ring.
- `strip` and `ring` join the chains in the order you list the roots. For a ring, list them around the body.
- For a closed ring, `normals: 'outward'` points each particle's normal away from the cloth's centre.

## Bending

The surface connections (`nearest`, `strip` and `ring`) build triangles between neighbouring chains. `bendingStiffness`, from 0 to 1, sets how strongly the surface keeps its shape across them. The default is `1`.

```ts
settings: { bendingStiffness: 0.3 }, // silk: folds easily
settings: { bendingStiffness: 1 }, // felt: keeps its shape
```

`chains` builds no triangles, so `bendingStiffness` has no effect on it. `tuneCloth` can change it at any time, including to and from 0.

## Edge contact

With `collision: { mode: 'point' }`, the default, colliders push particles only. A thin collider can pass between two chains. `collision: { mode: 'edge' }` also tests the edges between particles, so it cannot. Edge contact costs more.

```ts
settings: { collision: { mode: 'edge', friction: 0.1 } }
```

See [Colliders](../colliders/) for shapes and friction.

## See it

- [Curtain in the wind](../../examples/curtain/) uses `nearest` with edge contact and bending.

- [Robe on a mannequin](../../examples/dress-form/) uses `ring` around the hips.

- [Fabric lab](../../examples/fabric-lab/) compares bending stiffness on silk, linen and felt.
