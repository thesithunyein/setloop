import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  AuthorityType, MINT_SIZE, TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction, createInitializeMint2Instruction,
  createMintToInstruction, createSetAuthorityInstruction, getAssociatedTokenAddressSync,
  getMint, unpackAccount,
} from '@solana/spl-token';
import { assertDevnet, base, findCommitmentSignature, readSolanaReceipt, send } from './client.mjs';

const [keyPath,address] = process.argv.slice(2);
if (!keyPath || !address || process.argv.length !== 4) {
  throw new Error('Usage: npm run award -- /path/to/devnet-coordinator-keypair.json COMMITTED_ROOM_ADDRESS');
}

await assertDevnet();
const issuer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(keyPath,'utf8'))));
const room = new PublicKey(address);
const receipt = await readSolanaReceipt(room);
if (receipt.settler !== issuer.publicKey.toBase58()) throw new Error('Use the round’s devnet coordinator key.');
if (receipt.result !== 1 || receipt.transfers.length !== 3 || receipt.inventories.some(album => album.includes(0))) {
  throw new Error('Only a committed swap that completes all three albums earns a badge.');
}
const commitment = await findCommitmentSignature(room);
if (!commitment) throw new Error('Could not verify the room’s commitment transaction.');

// The same coordinator and room always identify the same mint. After issuance,
// removal of the mint authority makes this three-edition supply permanent.
const seed = createHmac('sha256',issuer.secretKey).update('setloop:devnet:completion:v1:').update(room.toBuffer()).digest();
const mint = Keypair.fromSeed(seed);
const wallets = receipt.seats.map(address => new PublicKey(address));
const accounts = wallets.map(wallet => getAssociatedTokenAddressSync(mint.publicKey,wallet));
let signature = null;
if (!await base.getAccountInfo(mint.publicKey,'confirmed')) {
  const rent = await base.getMinimumBalanceForRentExemption(MINT_SIZE,'confirmed');
  const instructions = [
    SystemProgram.createAccount({fromPubkey:issuer.publicKey,newAccountPubkey:mint.publicKey,lamports:rent,space:MINT_SIZE,programId:TOKEN_PROGRAM_ID}),
    createInitializeMint2Instruction(mint.publicKey,0,issuer.publicKey,null),
    ...wallets.flatMap((wallet,i) => [
      createAssociatedTokenAccountIdempotentInstruction(issuer.publicKey,accounts[i],wallet,mint.publicKey),
      createMintToInstruction(mint.publicKey,accounts[i],issuer.publicKey,1n),
    ]),
    createSetAuthorityInstruction(mint.publicKey,issuer.publicKey,AuthorityType.MintTokens,null),
    new TransactionInstruction({
      programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      keys:[],
      data:Buffer.from(`Setloop completion badge · Devnet · room ${address}`),
    }),
  ];
  signature = await send(base,issuer,instructions,[mint]);
}
const state = await getMint(base,mint.publicKey,'confirmed');
if (state.supply !== 3n || state.decimals !== 0 || state.mintAuthority || state.freezeAuthority) {
  throw new Error('The completion mint does not match the expected fixed-supply edition.');
}
const data = await base.getMultipleAccountsInfo(accounts,'confirmed');
const recipients = accounts.map((account,i) => {
  const wallet = wallets[i];
  if (!data[i] && !signature) return {wallet:wallet.toBase58(),account:account.toBase58(),balance:'0'};
  const token = unpackAccount(account,data[i]);
  if (!token.owner.equals(wallet) || !token.mint.equals(mint.publicKey) || (signature && token.amount !== 1n)) {
    throw new Error('A recipient account does not match the expected badge.');
  }
  return {wallet:wallet.toBase58(),account:account.toBase58(),balance:String(token.amount)};
});
console.log(JSON.stringify({room:address,commitment,mint:mint.publicKey.toBase58(),signature,supply:3,recipients},null,2));
