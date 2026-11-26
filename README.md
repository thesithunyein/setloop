<p align="center">
  <a href="https://setloop.vercel.app/"><img src="public/setloop-logo.png" alt="Setloop logo" width="160" height="160"></a>
</p>

<h1 align="center">Setloop</h1>

<p align="center"><strong>One swap. Three full sets.</strong><br>A private three-person stamp swap you can play in your browser.</p>

<p align="center">
  <a href="https://setloop.vercel.app/"><img alt="Live app" src="https://img.shields.io/badge/Setloop-Live%20app-cf1124?style=flat-square&amp;logo=vercel&amp;logoColor=white"></a>
  <a href="https://setloop.vercel.app/practice?round=choice"><img alt="Solo practice" src="https://img.shields.io/badge/Play-Solo%20practice-211b20?style=flat-square"></a>
  <a href="https://setloop.vercel.app/docs"><img alt="User guide" src="https://img.shields.io/badge/Read-User%20guide-cf1124?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/License-MIT-211b20?style=flat-square"></a>
</p>

## MagicBlock Blitz v10 eligibility evidence

Setloop integrates **MagicBlock Private Ephemeral Rollups on Solana devnet**. The program delegates the round and offer accounts, restricts who can read sealed offers, matches the three offers inside the private rollup, and commits the round result to Solana. After a match, a separate Solana transaction transfers all three SPL stamps between the demo wallets together. Everyday multiplayer uses Setloop's server ledger. Judges can try the deployed MagicBlock integration from the live devnet demo.

| Check | Evidence |
| --- | --- |
| Blitz v10 integration rule | [Official eligibility and judging criteria](https://build.magicblock.app/?event=17&stage=blitz) |
| Executable Setloop program on Solana devnet | [Program `GHWCZYzCsEEiYvdCVQ5o9aYyserYiJ3TX2tqb6hS3di9`](https://explorer.solana.com/address/GHWCZYzCsEEiYvdCVQ5o9aYyserYiJ3TX2tqb6hS3di9?cluster=devnet) · [Anchor source](chain/src/lib.rs) |
| Delegation to MagicBlock's private validator | [Delegation transaction](https://explorer.solana.com/tx/3RuLq8QejMW5qyM3Gk7jQCsrTsAToFUxPaZ1tuKYzWjTpkcw3tR7QaGKC5MAZ9HTRjDpDpGMYPTpZ86vbcZqsYzr?cluster=devnet) |
| Private rollup result committed back to Solana | [Live judge match commitment](https://explorer.solana.com/tx/4FHLVfVZJfdLvf8WKFMgrZj4UuRrAwRiGTVLNuZDCXhBAxVyhu5T8YQYW8w3AJaKYMNQZPCnMMakLAEBi4pmVCb7?cluster=devnet) · [No-match commitment](https://explorer.solana.com/tx/3LuJCdQWV9dP7w3FrJoaHTJwW5ujCJoPuVmyLu4yoNMcSNf9v7AzPXmdGqZoFjrxkWJw9RY6UEA1t3uMiRyJaxGu?cluster=devnet) |
| Public demo and proof | [Play the live judge demo](https://setloop.vercel.app/blitz#live-demo) · [Verified three-round walkthrough](https://setloop.vercel.app/blitz#verified-stamps) · [Evidence JSON](https://setloop.vercel.app/blitz-evidence.json) |

## Try it

| Start here | What you can verify |
| --- | --- |
| [Run a private devnet swap](https://setloop.vercel.app/blitz#live-demo) | Play all three funded seats, seal offers on MagicBlock, and open a fresh Solana receipt. Replay with one changed offer or re-trade the stamps you earned. |
| [Practice a Choice round](https://setloop.vercel.app/practice?round=choice) | Pick one of two valid offers for each collector. A round can close without a match even when all three offers were saved. |
| [Play with two friends](https://setloop.vercel.app/) | Create a room, share its code, and save one private offer per player. |
| [Open a verified production receipt](https://setloop.vercel.app/receipt/A4T4S3) | See three completed transfers and the browser's check of the receipt and album totals. |
| [Read the user guide](https://setloop.vercel.app/docs) | Read the steps for hosting, joining, sharing links, and troubleshooting. |

## The problem

A direct swap works only if two people each have what the other needs. Three friends can have all the right pieces and still be stuck. Alice needs Cara's extra Star, Cara needs Ben's extra Moon, and Ben needs Alice's extra Sun.

## What Setloop does

Setloop collects one offer per player and looks for a cycle that satisfies all three. Each person gives one duplicate and receives their missing stamp. If any offer is missing or the offers don't form a complete cycle, everyone keeps their original stamps.

The stamps are digital game pieces. You can play in a browser without signing up, paying, or connecting a wallet. In the devnet demo, MagicBlock privately matches the offers and commits the result to Solana. When there’s a match, one separate Solana transaction moves all three stamps between wallets.

## How it works

1. **Start a room.** Choose a duration and round type, then share the invite link. The countdown starts when the third player joins.
2. **Save a private offer.** Choose one extra stamp to give and one missing stamp to receive. Other collectors see only whether your offer is ready. You can change it until the round ends.
3. **Finish together.** The timer can run out, or the host can finish early after all three offers are ready. A match moves all three stamps together.
4. **Check the result.** An online round has a public receipt. It records each transfer or shows that no stamps moved.

Classic rounds start with one possible offer per collector. Choice rounds start with two different duplicates per collector. Changing a single offer can break a match even when everyone is ready.

| Collector | Gives | Gets |
| --- | --- | --- |
| Alice | Sun to Ben | Star from Cara |
| Ben | Moon to Cara | Sun from Alice |
| Cara | Star to Alice | Moon from Ben |

### What has been verified

| Path | Status | Evidence |
| --- | --- | --- |
| Hosted multiplayer | Live on Vercel with private Blob storage | A three-player production test verified offer isolation, matching, and public receipt access. [Receipt](https://setloop.vercel.app/receipt/A4T4S3) |
| Solo practice | Live in the browser | Uses the same matching rules and supports both outcomes. [Try it](https://setloop.vercel.app/practice) |
| Local multiplayer | Runs with Node and SQLite | Tests cover concurrent joins and offers, repeated closes, and no-match rounds. [Tests](test/rooms.test.mjs) |
| Solana and MagicBlock | Private ER match and no-match verified on devnet | Three wallets could read their own offers and were denied all six cross-seat reads in each run. [Matched receipt](https://setloop.vercel.app/devnet/G5T1hqXX9Y66GqztrR6qokJqfejzkW7DzK4nRhQJyPWN) · [No-match receipt](https://setloop.vercel.app/devnet/AUVS6efh9zQ75h1wnPbRfME13VK67UkR3XDr3CosMau7) |
| Collector ownership | Fixed-supply devnet completion badges | Three badges were issued to three wallets. The same wallets retained their badges after a later no-match round. [Badge mint](https://explorer.solana.com/address/hXKUAee2Yrh8gaEp1XqFoPd2bjDNCqCSr2cEzRAeHUy?cluster=devnet) |

### Live devnet demo

1. In the [judge page](https://setloop.vercel.app/blitz#live-demo), start a sponsored demo. Seal Sun for Alice, Moon for Ben, and Star for Cara. Finish and follow the links to the MagicBlock commitment and the three SPL transfers.
2. Open the comparison round. Change only Alice to Moon. The receipt and before/after wallet balances show that every collector kept their stamps.
3. Trade again using the same wallets. Follow the suggested offers to spend the stamps received in the first round. After finishing, a collector can send their remaining stamps to a Solana wallet they control.

Setloop signs for the three hosted demo wallets. After verifying the MagicBlock commitment, the service signs the separate stamp transfer transaction. A receipt-specific marker prevents duplicate transfers on retry. A no-match result sends no stamp transaction. Receipts label the committed round inventory and separately display the saved SPL wallet balances for the published demo rounds, including stamps carried from earlier rounds.

The sponsored demo has a limited number of sessions. If live devnet is unavailable or sponsorship is exhausted, open the [verified three-round production example](https://setloop.vercel.app/blitz#verified-stamps). It includes the two SPL swaps, the no-match receipt, and a claim to another wallet. [My albums](https://setloop.vercel.app/collection) shows saved demo albums when you return in the same browser.

## Architecture

```mermaid
flowchart LR
    subgraph Browser["Browser"]
      UI["Room and album UI"]
      Practice["Solo practice"]
      Verify["Receipt consistency check"]
    end

    subgraph Core["Shared application logic"]
      API["Room API and seat authorization"]
      Rules["Cycle matching and inventory checks"]
    end

    subgraph Storage["Storage by runtime"]
      Blob["Private Vercel Blob · production"]
      SQLite["SQLite · local Node"]
      D1["D1 · optional Worker"]
    end

    Practice -->|"Same rules in the browser"| Rules
    UI -->|"Seat credential on private actions"| API
    API --> Rules
    API -->|"Conditional room update"| Blob
    API -->|"Versioned row update"| SQLite
    API -->|"Versioned row update"| D1
    API -->|"Closed-round record and SHA-256 digest"| Verify
```

### From offer to public receipt

```mermaid
sequenceDiagram
    actor Host
    participant Players as Two other collectors
    participant API as Setloop API
    participant Store as Private room store
    actor Reader as Public receipt reader

    Host->>API: Create room and get invite code
    Players->>API: Join with invite code
    API->>Store: Fill third seat and start countdown
    par Host offer
        Host->>API: Save private offer with seat credential
    and Friend offers
        Players->>API: Save each offer with its own seat credential
    end
    API->>Store: Save offers with version checks
    Host->>API: Finish early once all are ready
    Note over API,Store: A room read or action can also finalize an expired round
    API->>Store: Read latest offers and album counts
    alt All three offers match
        API->>Store: Save all transfers and the receipt together
    else No match
        API->>Store: Save no-match receipt and original albums
    end
    Reader->>API: Open public receipt by room code
    API-->>Reader: Outcome, transfers, album counts, and digest
```

A production room is one private Blob object. The server reads the latest version and writes only if that version still matches. If another request updates the room first, the server reloads it and tries again. This keeps all album changes and the receipt in one successful update.

The browser recalculates the receipt's SHA-256 digest and checks whether the transfers produce the recorded album counts. These are consistency checks against the record served by Setloop. The hosted receipt names the Setloop server ledger as its source.

## Run locally

Use **Node.js 22.13 or newer**.

```sh
git clone https://github.com/thesithunyein/setloop.git
cd setloop
npm ci
npm start
```

Open [localhost:4173](http://127.0.0.1:4173/). On Windows, you can also run [Start Setloop.cmd](Start%20Setloop.cmd).

| Setting | Default or purpose |
| --- | --- |
| `PORT` | `4173` |
| `SETLOOP_HOST` | `127.0.0.1` |
| `SETLOOP_DB` | Override the SQLite path. The default is `.data/setloop.sqlite`. |
| `SETLOOP_CHAIN_KEYPAIR` | Optional devnet coordinator key path for the experimental adapter |
| `SETLOOP_JUDGE_KEYPAIR` | Optional independent devnet-only sponsor key path for testing the judge flow locally |

To try an online round on one device, open **Guide → Technical details → Open three-tab demo**. Open each sample player in a separate tab, save all three offers, then finish from Alice's tab. For a no-match round, let the timer expire with one offer missing.

```sh
npm test
npm run build
```

The tests cover seat-level offer visibility, concurrent joins and writes, repeated closes, expired rounds, stale inventory, and Solana receipt decoding. The Worker build emits `dist/server/` and uses a D1 binding named `DB` with the migration in `drizzle/`.

## Deployment

Production runs at [setloop.vercel.app](https://setloop.vercel.app/) from `main`. The [Vercel config](vercel.json) serves `public/`, packages the browser practice rules, and routes API requests to the [dispatch function](api/dispatch.mjs).

To host your own copy, connect a **private Vercel Blob store** to your project and deploy after the connection is configured. The function supports the store ID with Vercel runtime identity or a project-scoped `BLOB_READ_WRITE_TOKEN`. Keep credentials in the deployment environment.

To enable the hosted judge flow, set `SETLOOP_JUDGE_SIGNER` as a sensitive Production variable with a separate, funded devnet sponsor keypair in Solana CLI byte-array format. Each sponsor can open up to three sessions, and each session supports up to three rounds. Store the program upgrade key separately. The judge service checks the devnet genesis hash before it signs.

## Solana and MagicBlock

The [Anchor program](chain/src/lib.rs) models stamp credits in a room account. It prepares permissions before writing offers into the private rollup, checks the full cycle at settlement, clears offers, and publishes a round summary. The settlement coordinator is a separate trusted role with access to the offers.

The [Node adapter](chain/bridge.mjs) can route local rooms to a deployed devnet program. It signs on behalf of demo seats with test funds. The [receipt decoder](src/solana.mjs) checks the account owner and layout against the configured program ID.

With an Anchor-compatible SBF toolchain, run these commands in `chain/`:

```sh
cargo test --locked
cargo build-sbf -- --locked
npm ci
```

Deploy to **Solana devnet** using a funded devnet-only wallet and a program keypair that matches `declare_id!`. If you use a new program ID, update `chain/Anchor.toml`, `chain/src/lib.rs`, `chain/client.mjs`, and `src/solana.mjs`.

```sh
npm run demo -- /absolute/path/to/devnet-keypair.json
npm run demo -- /absolute/path/to/devnet-keypair.json --no-match
npm run verify -- YOUR_SOLANA_ROUND_ADDRESS
```

A complete devnet check requires three wallets, own-offer access, denied cross-seat reads, a commitment signature, and a base-layer receipt with the expected album counts. The no-match run sends three valid but incompatible offers and checks that every album keeps its original counts. To test from the web app locally, set `SETLOOP_CHAIN_KEYPAIR` before starting Node. Keep keypair files outside the repository. [MagicBlock examples](https://github.com/magicblock-labs/magicblock-examples)

The [evidence page](https://setloop.vercel.app/blitz) shows both private runs. The normal web rooms still use the Setloop server ledger. For a matching-only test on the public Asia rollup, set `SETLOOP_PER_VALIDATOR` to `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` and add `--public-er` to the demo command. Use synthetic offers because the public rollup can expose offer data.

### Wallet-owned completion badges

The demo can reuse three devnet test wallets via `SETLOOP_DEMO_KEY_DIR`, containing `seat-1.keypair.json` through `seat-3.keypair.json`. The coordinator can issue one transferable completion badge to each wallet after a confirmed match:

```sh
npm run award -- /absolute/path/to/devnet-keypair.json COMMITTED_ROOM_ADDRESS
```

Issuance creates one three-edition SPL mint per coordinator and round, credits the three wallets in one transaction, and removes mint authority. The onchain receipt and issuance transaction make the award independently checkable. The coordinator issues these badges on devnet. The separate live judge demo uses reusable SPL stamps that stay in the wallets between rounds.

## Project structure

```text
setloop/
├── .gitignore / .vercelignore    Local data, secrets, and upload exclusions
├── api/
│   └── dispatch.mjs             Vercel API entry point
├── chain/
│   ├── Anchor.toml               Solana devnet configuration
│   ├── Cargo.toml / Cargo.lock
│   ├── package.json / package-lock.json
│   ├── bridge.mjs                Node-to-devnet adapter
│   ├── award.mjs                 Fixed-supply devnet completion badges
│   ├── client.mjs                Program and private rollup client
│   ├── demo.mjs                  Devnet smoke test
│   ├── stamps.mjs                Persistent SPL stamp albums and transfers
│   ├── verify.mjs                Devnet receipt CLI
│   └── src/
│       ├── lib.rs                Anchor program and permissions
│       └── matching.rs           Rust matching and inventory rules
├── drizzle/
│   ├── 0000_setloop_rooms.sql    D1 room schema
│   └── meta/_journal.json        D1 migration journal
├── public/
│   ├── index.html                Shared HTML shell
│   ├── app.js                    Landing, room, practice, receipt, and guide UI
│   ├── styles.css                Styles and illustrations
│   ├── setloop-logo.png           Current logo and favicon
│   ├── blitz-evidence.json        Published devnet proof links
│   ├── favicon.svg / lettermark.svg / logo.svg
│   └── google-sans.woff2 / Google-Sans-OFL.txt
├── src/
│   ├── api.mjs                   Room and receipt routes
│   ├── blob-store.mjs            Private Blob and conditional writes
│   ├── build.mjs                 Worker packaging
│   ├── judge.mjs                 Hosted devnet demo and settlement coordination
│   ├── launch.mjs                Windows launch helper
│   ├── room.mjs                  Shared matching rules and private room views
│   ├── server.mjs                Local HTTP and SQLite runtime
│   ├── solana.mjs                Devnet receipt decoder
│   ├── store.mjs                 Versioned SQL storage
│   └── worker.mjs                Optional D1 Worker runtime
├── test/
│   ├── blob-store.test.mjs        Fresh reads and stale-write rejection
│   ├── rooms.test.mjs             Multiplayer, privacy, and settlement
│   └── solana.test.mjs            Receipt account validation
├── package.json / package-lock.json
├── Start Setloop.cmd
├── vercel.json
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── LICENSE
```

## Security and community

The server stores hashes of player credentials and exposes an open offer only to its owner during normal play. Public receipts include player nicknames, album counts, and matching transfers. The hosted game trusts the Setloop server and its private store. Setloop has had functional testing and has yet to undergo an independent security audit.

See the [security policy](SECURITY.md), [contribution guide](CONTRIBUTING.md), and [code of conduct](CODE_OF_CONDUCT.md).

## License

Setloop's original software and documentation are under the [MIT License](LICENSE). Google Sans is bundled under the [SIL Open Font License](public/Google-Sans-OFL.txt). Branding and third-party assets retain their respective rights.
