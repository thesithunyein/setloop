import { createHmac } from 'node:crypto';
import { Keypair, SystemProgram } from '@solana/web3.js';
import {
  AuthorityType, MINT_SIZE, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction, createMintToInstruction, createSetAuthorityInstruction,
  createTransferCheckedInstruction, getAssociatedTokenAddressSync, unpackAccount,
} from '@solana/spl-token';
import { base, send } from './client.mjs';
import { STAMPS, startingInventory } from '../src/room.mjs';

const seedKey = (operator, label) => Keypair.fromSeed(
  createHmac('sha256', operator.secretKey).update(`setloop:stamps:v1:${label}`).digest()
);

export function createStampAlbum(operator, session, seats) {
  const mints = STAMPS.map(stamp => seedKey(operator, `${session}:${stamp}`));
  const accounts = seats.map(seat => mints.map(mint =>
    getAssociatedTokenAddressSync(mint.publicKey, seat.publicKey)
  ));

  async function issue() {
    const existing = await base.getMultipleAccountsInfo(mints.map(mint => mint.publicKey));
    if (existing.every(Boolean)) return;
    const rent = await base.getMinimumBalanceForRentExemption(MINT_SIZE);
    for (const [i, mint] of mints.entries()) {
      if (existing[i]) continue;
      const instructions = [
        SystemProgram.createAccount({
          fromPubkey: operator.publicKey, newAccountPubkey: mint.publicKey,
          lamports: rent, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint.publicKey, 0, operator.publicKey, null),
        ...seats.flatMap((seat, slot) => {
          const account = accounts[slot][i];
          const amount = startingInventory(slot, 'choice')[i];
          const create = createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, account, seat.publicKey, mint.publicKey);
          return amount ? [create, createMintToInstruction(mint.publicKey, account, operator.publicKey, amount)] : [create];
        }),
        createSetAuthorityInstruction(mint.publicKey, operator.publicKey, AuthorityType.MintTokens, null),
      ];
      await send(base, operator, instructions, [mint]);
    }
  }

  async function read() {
    const entries = await base.getMultipleAccountsInfo(accounts.flat());
    return seats.map((seat, slot) => accounts[slot].map((account, i) => {
      const token = unpackAccount(account, entries[slot * STAMPS.length + i]);
      if (!token.owner.equals(seat.publicKey) || !token.mint.equals(mints[i].publicKey)) {
        throw new Error('Unexpected token account in the demo album.');
      }
      return Number(token.amount);
    }));
  }

  async function sendOnce(label, instructions, signers) {
    // A marker created with the transfers makes the whole transaction safe to retry.
    const marker = seedKey(operator, `${session}:${label}`);
    const registered = info => info?.owner.equals(SystemProgram.programId) && info.data.length === 1;
    const existing = await base.getAccountInfo(marker.publicKey);
    if (registered(existing)) {
      const signatures = await base.getSignaturesForAddress(marker.publicKey, {limit: 10});
      const successful = signatures.filter(entry => !entry.err);
      if (!successful.length) throw new Error('The stamp transaction is still indexing.');
      return successful.at(-1).signature;
    }
    const rent = await base.getMinimumBalanceForRentExemption(1);
    const register = existing ? [
      SystemProgram.transfer({fromPubkey: operator.publicKey, toPubkey: marker.publicKey, lamports: Math.max(0, rent - existing.lamports)}),
      SystemProgram.allocate({accountPubkey: marker.publicKey, space: 1}),
    ] : [SystemProgram.createAccount({
      fromPubkey: operator.publicKey, newAccountPubkey: marker.publicKey,
      lamports: rent, space: 1, programId: SystemProgram.programId,
    })];
    return send(base, operator, [...register, ...instructions], [...signers, marker]);
  }

  async function apply(receipt) {
    if (!receipt.transfers.length) return null;
    const transfers = receipt.transfers.map(({from, to, stamp}) => {
      const i = STAMPS.indexOf(stamp);
      return createTransferCheckedInstruction(accounts[from][i], mints[i].publicKey, accounts[to][i], seats[from].publicKey, 1, 0);
    });
    return sendOnce(`settlement:${receipt.address}`, transfers, seats);
  }

  async function claim(slot, destination, inventory) {
    const source = seats[slot];
    const instructions = mints.flatMap((mint, i) => {
      if (!inventory[i]) return [];
      const target = getAssociatedTokenAddressSync(mint.publicKey, destination);
      return [
        createAssociatedTokenAccountIdempotentInstruction(operator.publicKey, target, destination, mint.publicKey),
        createTransferCheckedInstruction(accounts[slot][i], mint.publicKey, target, source.publicKey, inventory[i], 0),
      ];
    });
    if (!instructions.length) throw new Error('No stamps are available to claim.');
    return sendOnce(`claim:${slot}`, instructions, [source]);
  }

  return {issue, read, apply, claim, wallets: seats.map(seat => seat.publicKey.toBase58()), mints: mints.map(mint => mint.publicKey.toBase58())};
}
