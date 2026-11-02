import tv from '@/tailwind/tv';

const buttonStyles = tv({
  base: 'inline-flex min-h-touch items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  variants: {
    tone: {
      primary: 'bg-ink text-on-ink hover:bg-ink/85',
      secondary: 'border border-line bg-paper text-ink hover:bg-soft',
      quiet: 'text-muted hover:bg-soft hover:text-ink',
    },
    size: {
      regular: 'px-4',
      large: 'px-6 text-base',
    },
  },
  defaultVariants: { tone: 'secondary', size: 'regular' },
});

export type ButtonTone = 'primary' | 'secondary' | 'quiet';
export type ButtonSize = 'regular' | 'large';

export default buttonStyles;
