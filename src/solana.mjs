import { RoomError } from './room.mjs';

const PROGRAM = 'GHWCZYzCsEEiYvdCVQ5o9aYyserYiJ3TX2tqb6hS3di9';
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const STAMPS = ['Sun','Moon','Star'];

export async function readDevnetReceipt(address, rpc = globalThis.fetch) {
  if (!ADDRESS.test(address)) throw new RoomError('Enter a valid Solana room address.');
  const response = await rpc('https://api.devnet.solana.com',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[address,{encoding:'base64',commitment:'confirmed'}]}),
    signal:AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!response?.ok) throw new RoomError('Solana devnet is unavailable. Try again shortly.',502);
  const result = await response.json();
  if (result.error) throw new RoomError('Devnet rejected that account lookup.',502);
  const info = result.result?.value;
  if (!info || info.owner !== PROGRAM || info.executable) throw new RoomError('No committed Setloop round was found at that devnet address.',404);
  const data = Uint8Array.from(atob(info.data[0]),letter=>letter.charCodeAt(0));
  const expected = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('account:Room'))).subarray(0,8);
  if (data.length !== 213 || !expected.every((byte,i)=>data[i]===byte)) throw new RoomError('That account is not a Setloop room.',404);
  const view = new DataView(data.buffer);
  const seats = [48,80,112].map(start=>base58(data.subarray(start,start+32)));
  const resultFlag = data[189];
  if (resultFlag !== 1 && resultFlag !== 2) throw new RoomError('This room has not committed a completed round.',409);
  const inventories = [198,201,204].map(start=>Array.from(data.subarray(start,start+3)));
  const donors = Array.from(data.subarray(207,210));
  const given = Array.from(data.subarray(210,213));
  if (resultFlag === 1 && (new Set(donors).size !== 3 || donors.some((donor,recipient)=>donor>2||donor===recipient) || given.some(index=>index>2) || inventories.some(inventory=>inventory.some(amount=>amount!==1)))) {
    throw new RoomError('The committed room contains an inconsistent trade.',409);
  }
  const transfers = resultFlag === 1 ? donors.map((donor,recipient)=>({from:seats[donor],to:seats[recipient],stamp:STAMPS[given[donor]]})) : [];
  return {address,program:PROGRAM,closedAt:Number(view.getBigInt64(190,true))*1000,transfers,inventories,result:resultFlag===1?'matched':'no-match'};
}

function base58(bytes) {
  let value = bytes.reduce((sum,byte)=>(sum << 8n) + BigInt(byte),0n);
  let result = '';
  while (value > 0) { result = ALPHABET[Number(value % 58n)] + result; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; result = `1${result}`; }
  return result;
}
