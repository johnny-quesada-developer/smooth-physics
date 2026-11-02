# smooth-physics

Real-time secondary motion for character rigs on the web: cloth, capes, hair, tails, ribbons and chains simulated on
the bones a model already has.

| Folder                | What it holds                                                               |
| --------------------- | --------------------------------------------------------------------------- |
| `libs/smooth-physics` | The library: the solver, the engine-agnostic core and the three.js adapter. |
| `apps/website`        | The website: landing page, live examples, showreel and documentation.       |

## Commands

```sh
pnpm install
pnpm --filter smooth-physics test               # unit and golden tests
pnpm --filter smooth-physics test:performance   # performance regression test
pnpm --filter website dev                       # the website, with the library from source
pnpm --filter website build
pnpm --filter website test:e2e                  # end-to-end tests (Playwright)
pnpm exec vp check                              # lint, format and type checks
```

The library's README documents its API and development notes.

## License

MIT. See [LICENSE](LICENSE).
