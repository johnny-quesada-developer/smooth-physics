import type { ControlTiming } from '@/features/Stage/runtime/types';

export type ExampleSlug = 'hanging-chains' | 'curtain' | 'dress-form' | 'fringe-lamp' | 'ribbon-baton' | 'banner-field' | 'worker-wall' | 'fabric-lab';

export type FacetName = 'connection' | 'feature' | 'level' | 'runtime';
export type Facets = Readonly<Record<FacetName, readonly string[]>>;

export type ControlDefinition =
  | {
      readonly kind: 'range';
      readonly key: string;
      readonly label: string;
      readonly minimum: number;
      readonly maximum: number;
      readonly step: number;
      readonly initial: number;
      readonly unit?: string;
      readonly timing: ControlTiming;
    }
  | { readonly kind: 'switch'; readonly key: string; readonly label: string; readonly initial: boolean; readonly timing: ControlTiming }
  | {
      readonly kind: 'choice';
      readonly key: string;
      readonly label: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly initial: string;
      readonly timing: ControlTiming;
    }
  | { readonly kind: 'action'; readonly key: string; readonly label: string };

export type Example = {
  readonly slug: ExampleSlug;
  readonly title: string;
  readonly summary: string;
  readonly description: readonly string[];
  readonly tags: readonly string[];
  readonly facets: Facets;
  readonly controls: readonly ControlDefinition[];
  readonly hasColliders: boolean;
  // The moving prop the reader can pick up and drag through the cloth, named in the stage's hint.
  readonly grabbable?: string;
  readonly code: string;
};
