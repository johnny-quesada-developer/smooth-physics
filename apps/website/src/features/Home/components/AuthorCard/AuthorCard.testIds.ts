const AuthorCardTestIds = {
  root: 'author-card',
  photo: 'author-card-photo',
  link: (name: string): string => `author-card-link-${name}`,
} as const;

export default AuthorCardTestIds;
