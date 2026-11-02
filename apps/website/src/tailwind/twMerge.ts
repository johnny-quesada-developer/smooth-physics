import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ['touch'],
      radius: ['control', 'code', 'panel', 'stage'],
      shadow: ['raised', 'floating'],
      text: ['display', 'title'],
    },
  },
});

export default twMerge;
