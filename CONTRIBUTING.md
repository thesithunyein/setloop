# Contributing to Setloop

## Set up a local copy

Use Node.js 22.13 or newer. Fork or clone the repository, then run:

```sh
npm ci
npm start
```

Open [the local app](http://127.0.0.1:4173/) and use a new room for experiments. The local runtime uses SQLite. The [README](README.md) explains the hosted, Worker, and experimental devnet runtimes.

## Propose a change

- Describe the problem in a [GitHub issue](https://github.com/thesithunyein/setloop/issues) or draft pull request. Follow the [security policy](SECURITY.md) for vulnerability reports.
- Keep changes focused. If you change matching or room behavior, check a successful match, a no-match result, and the public receipt. Protect each player's offer and keep the three transfers in one room update.
- Run `npm test` and `npm run build`. For UI changes, check the relevant routes at phone and desktop widths.
- In the pull request, explain what changed and how you verified it. Use sample rooms and redact any private player links.

Read the [code of conduct](CODE_OF_CONDUCT.md) before participating.
