<img src="public/setloop-logo.png" alt="Setloop logo" width="144" height="144">

# Setloop

Three collectors privately offer duplicate stamps. A matching cycle moves all three stamps in one settlement. If the round closes without a cycle, everyone keeps their pieces.

**Build status.** The local web app completed the three-seat browser demo and receipt check. Five web tests and three standalone Rust matching tests passed. The MagicBlock devnet TEE authenticated successfully. The full Solana program build was interrupted by local I/O failures. The deployment wallet had no devnet SOL after the faucet rejected its requests, so the live three-wallet settlement remains unverified.

## Run the web app

Requires Node.js 22.13 or newer. The web app uses the built-in Node SQLite driver and needs no npm install.

```sh
npm start
```

Open `http://127.0.0.1:4173`. On Windows, `Start Setloop.cmd` starts the same server and opens the app. The default SQLite file is `.data/setloop.sqlite`. Set `SETLOOP_DB` to choose another database file, `PORT` to change the port, or `SETLOOP_HOST` to bind another interface.

Select **Practice on your own** to try both outcomes in one tab with sample stamps. The practice round uses the same matching rules as an online swap and runs without room storage.

To test an online room on one device, open **Guide**, scroll to **Technical details**, and select **Open three-tab demo**. Open the Alice, Ben, and Cara seats in separate tabs. Save each player’s offer, then select **Finish round early** in Alice’s tab. **View public receipt** works without a private player link. For a no-match round, let the timer end before all three offers are saved.

For a regular room, select a round duration, then send two people the room code. Player seats use separate bearer credentials. The public invite lets others join a vacant seat and does not contain the host credential. The demo launcher intentionally provides the three demo seat links to the browser that created the demo. An authenticated session receives the player’s own offer. Other players and observers receive only names and readiness while the room is open.

## Verify a round

- **Server round:** Open `/receipt/ROOMCODE` or enter the room code on **Verify a trade**. The browser recomputes a SHA-256 digest of the receipt and checks the before/after inventories. These checks validate the served record’s internal consistency. The source of the record is the Setloop server ledger.
- **Solana devnet round:** Enter the committed round account address on **Verify a trade**. This path fetches the account from Solana devnet, checks the Setloop program owner and account layout, then displays the committed outcome and explorer link. It needs an actual deployed Setloop program and committed room.

## Build and test the web app

```sh
npm ci
npm test
npm run build
```

The Node tests cover concurrent joins and offers, seat-level offer isolation, duplicate settle requests, expired no-match rounds, stale inventory and devnet receipt decoding. The Worker build embeds the application files and uses Cloudflare D1 for room storage. The same compare-and-swap database update writes all balances and the receipt in both runtimes. The D1 migration is in `drizzle/`.

## Vercel hosting

Setloop’s Vercel Function uses a **private Vercel Blob store**. Connect the store to the Vercel project so its credentials are injected into the function. The app reads the latest private room state and uses conditional writes so concurrent submissions can’t overwrite each other. Vercel uses the server ledger, and the public receipt distinguishes it from Solana devnet settlement.

## MagicBlock program

The web app defaults to the server ledger. The `chain/` directory contains the Anchor implementation, a devnet smoke-test client, an RPC receipt reader, and a Node backend adapter that routes real rounds through the program. Devnet mode requires the SBF program deployed under the configured program ID and a funded **devnet-only** signing key. Both the smoke test and the backend adapter check that the program exists on devnet before starting.

- `create_room` sets three distinct player wallets and a separate settlement coordinator.
- `create_offer` initializes a blank offer account on Solana. The client delegates the accounts to the Private Ephemeral Rollup, where `prepare_offer` creates the offer’s permission before it can hold intent data.
- `seal_offer` stores the offer in private state. The intended account readers are the owning player and the settlement coordinator. The coordinator is a trusted role and cannot be one of the three player wallets. Participants’ offers do not appear in the public receipt.
- `settle` validates each balance and each edge of the cycle before applying a single room-state update. It clears the offer contents and `publish_receipt` commits the room summary back to Solana. The program models stamps as credits in its own room account.

On a machine with an installed Anchor-compatible Solana SBF toolchain, build inside `chain/`:

```sh
cargo test --locked
cargo build-sbf -- --locked
npm ci
```

Deploy `target/deploy/setloop.so` to Solana **devnet** using a funded devnet-only wallet and the program keypair matching `declare_id!`. If using a new keypair, synchronize the program ID in `chain/Anchor.toml`, `chain/src/lib.rs`, `chain/client.mjs` and `src/solana.mjs` before building and deploying. The signer files belong outside this project.

```sh
npm run demo -- /path/to/funded-devnet-keypair.json
npm run verify -- SOLANA_ROOM_ADDRESS
```

The smoke test exercises a three-wallet match, checks that one seat cannot read another offer, commits to Solana, and reads the final inventories from the base layer. Treat the Solana and MagicBlock path as unverified until that run succeeds and returns a commitment signature. The approach follows the [MagicBlock sealed-bid example](https://docs.magicblock.gg/pages/templates/sealed-bid-auction) and [official examples repository](https://github.com/magicblock-labs/magicblock-examples).

From the project root, set `SETLOOP_CHAIN_KEYPAIR` to the demo coordinator’s funded devnet-only key before `npm start` to enable the devnet web adapter. In PowerShell use `$env:SETLOOP_CHAIN_KEYPAIR = 'C:\path\to\devnet-only-keypair.json'`. The Node service derives and funds three separate demo seat keys per room and signs on their behalf. Browser players authenticate with their seat session. This mode is custodial for test stamp credits, uses a separate `setloop-devnet.sqlite` read model, and waits for the chain to confirm before reflecting offers and settlements. Preserve the same coordinator key if restarting in the middle of a room. The hosted D1 Worker uses the server ledger.
