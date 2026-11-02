import classNames from 'classnames';
import type { ComponentProps, FC } from 'react';

import ButtonLink from '@/components/ButtonLink';
import twMerge from '@/tailwind/twMerge';
import AuthorCardTestIds from './AuthorCard.testIds';
import { sitePath } from '@/site/paths';

type AuthorCardProps = ComponentProps<'section'>;

const LINKS: readonly { readonly name: string; readonly label: string; readonly href: string }[] = [
  { name: 'about', label: 'Meet the engineer', href: 'https://johnny-quesada-developer.github.io/react-global-state-hooks/about/' },
  { name: 'github', label: 'GitHub', href: 'https://github.com/johnny-quesada-developer' },
  { name: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/quesada-react-angular-typescript-developer/' },
];

const AuthorCard: FC<AuthorCardProps> = ({ className, ...props }) => {
  return (
    <section
      aria-labelledby="author-heading"
      className={twMerge(
        classNames('AuthorCard', 'flex flex-col gap-6 rounded-stage border border-line bg-surface p-6 sm:flex-row sm:items-start sm:gap-8 sm:p-8', className),
      )}
      data-testid={AuthorCardTestIds.root}
      {...props}
    >
      <img
        alt="Portrait of Johnny Quesada"
        className="w-36 shrink-0 rounded-code border border-line bg-lime-soft"
        data-testid={AuthorCardTestIds.photo}
        decoding="async"
        height="166"
        loading="lazy"
        sizes="144px"
        src={sitePath('/author/johnny-512.png')}
        srcSet={`${sitePath('/author/johnny-256.png')} 256w, ${sitePath('/author/johnny-512.png')} 512w`}
        width="140"
      />
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-lime uppercase">The engineer behind smooth-physics</p>
        <h2 className="text-2xl font-semibold tracking-tight text-balance" id="author-heading">
          Independent software. Accountable craftsmanship.
        </h2>
        <p className="max-w-2xl text-pretty text-muted">
          <span className="font-semibold text-ink">Johnny Esteban Quesada</span>, senior product engineer and author of react-global-state-hooks and
          easy-web-worker, the state and worker libraries this site runs on. Full-stack architecture, React and TypeScript, performance and developer tooling,
          with more than twelve years of engineering experience. Based in Spain.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {LINKS.map((link, index) => (
            <ButtonLink
              data-testid={AuthorCardTestIds.link(link.name)}
              href={link.href}
              key={link.name}
              rel="noreferrer"
              target="_blank"
              tone={index === 0 ? 'primary' : 'secondary'}
            >
              {link.label} <span aria-hidden="true">↗</span>
            </ButtonLink>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AuthorCard;
