import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import type { ExampleSlug } from '@/features/Examples/catalogue/types';

const EXAMPLE_SLUGS = [
  'hanging-chains',
  'curtain',
  'dress-form',
  'fringe-lamp',
  'ribbon-baton',
  'banner-field',
  'worker-wall',
  'fabric-lab',
] as const satisfies readonly ExampleSlug[];

const docs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    // A shorter label for the sidebar.
    nav: z.string().optional(),
    // One sentence under the title.
    lead: z.string(),
    section: z.enum(['start', 'concepts', 'reference', 'guides']),
    order: z.number(),
    kind: z.enum(['guide', 'concept', 'reference']),
    module: z.enum(['smooth-physics', 'smooth-physics/three']).optional(),
    example: z.enum(EXAMPLE_SLUGS).optional(),
    // The page layout renders an Install section with the package-manager tabs before the Markdown.
    install: z.boolean().default(false),
    tags: z.array(z.string()),
    features: z.array(z.string()).default([]),
  }),
});

export const collections = { docs };
