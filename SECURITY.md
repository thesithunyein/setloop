# Security policy

## Report a vulnerability

Report security issues privately to the Setloop maintainer. If GitHub offers **Report a vulnerability**, use it from the [Security tab](https://github.com/thesithunyein/setloop/security). Otherwise, contact [the maintainer](https://github.com/thesithunyein) through a private channel you already share. If you need a channel, use a [GitHub issue](https://github.com/thesithunyein/setloop/issues) to request one and leave the technical details out of the issue.

Include the affected URL or commit, the impact, and short steps using your own local test room. Redact private player links, tokens, and keypairs. Use local fixtures for reproduction and coordinate disclosure with the maintainer.

## Hosted game

- A room invite or code can be used to join an available seat. A private player link grants access to that seat if someone obtains it.
- Player credentials are stored as hashes. During a round, only the matching player credential returns that player's offer through the API. Other players can see nicknames and ready states.
- Production rooms are held in a private Vercel Blob store. The Setloop service and operators with store access are within the trust boundary.
- Public receipts expose nicknames, the outcome, and before-and-after album counts. Matched rounds also expose transfers. The receipt digest and inventory checks verify consistency against the served record.
- The hosted game has been functionally tested. An independent security audit is pending.

The experimental devnet adapter signs on behalf of demo seats. It is intended for test credits and funded devnet-only keys. Use a local test environment whenever possible.

[Read the user privacy guide](https://setloop.vercel.app/docs#privacy)
