export const STAMPS = ['sun', 'moon', 'star'];
const STARTERS = [[2, 1, 0], [0, 2, 1], [1, 0, 2]];
const CHOICE_STARTERS = [[2, 2, 0], [0, 2, 2], [2, 0, 2]];
const DEMO_NAMES = ['Alice', 'Ben', 'Cara'];

export function startingInventory(slot, variant) {
  return [...(variant === 'choice' ? CHOICE_STARTERS : STARTERS)[slot]];
}

export class RoomError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function addPlayer(room, nickname, tokenHash, now, demo = false) {
  if (room.status !== 'waiting' || room.players.length === 3) {
    throw new RoomError('This room has already filled.', 409);
  }
  const slot = room.players.length;
  const player = {
    slot, tokenHash, name: demo ? DEMO_NAMES[slot] : nickname || `Player ${slot + 1}`,
    inventory: startingInventory(slot, room.variant), offer: null,
  };
  room.players.push(player);
  if (room.players.length === 3) {
    room.status = 'open';
    room.deadline = now + room.duration * 60_000;
  }
  return player;
}

export function putOffer(room, player, give, need) {
  if (room.status !== 'open') throw new RoomError('Offers open when all three collectors join.', 409);
  const giveIndex = STAMPS.indexOf(give);
  const needIndex = STAMPS.indexOf(need);
  if (giveIndex < 0 || needIndex < 0 || player.inventory[giveIndex] < 2 || player.inventory[needIndex] !== 0) {
    throw new RoomError('Offer a duplicate and request an empty album slot.');
  }
  player.offer = { give, need };
}

export function findTransfers(players) {
  if (players.length !== 3 || players.some(player => !player.offer)) return [];
  const donors = players.map((recipient, index) => players.findIndex(
    (donor, donorIndex) => donorIndex !== index && donor.offer.give === recipient.offer.need,
  ));
  if (donors.includes(-1) || new Set(donors).size !== 3) return [];
  const transfers = donors.map((donor, recipient) => ({
    from: donor, to: recipient, stamp: players[donor].offer.give,
  }));
  if (transfers.some(({from, to, stamp}) => {
    const index = STAMPS.indexOf(stamp);
    return index < 0 || players[from].inventory[index] < 2 || players[to].inventory[index] !== 0;
  })) return [];
  return transfers;
}

export function settleRoom(room, now, proof = null) {
  if (room.status !== 'open') return;
  const transfers = proof ? proof.transfers : findTransfers(room.players);
  const before = room.players.map(player => [...player.inventory]);
  for (const { from, to, stamp } of transfers) {
    const index = STAMPS.indexOf(stamp);
    room.players[from].inventory[index]--;
    room.players[to].inventory[index]++;
  }
  room.status = transfers.length ? 'matched' : 'no-match';
  room.receipt = {
    version: 1, code: room.code, name: room.name, closedAt: now, result: room.status,
    players: room.players.map(({ slot, name, inventory }) => ({slot, name, before: before[slot], after: [...inventory]})),
    transfers,
  };
  if (proof) {
    room.receipt.closedAt = proof.closedAt;
    room.receipt.chain = {address:proof.address,program:proof.program,signature:proof.signature};
  }
  // The receipt is the lasting round record. Original intents are no longer needed.
  for (const player of room.players) player.offer = null;
}

export function roomView(room, player, now) {
  return {
    code: room.code, name: room.name, status: room.status, duration: room.duration, variant: room.variant || 'classic',
    deadline: room.deadline, time: now, ready: room.players.filter(member => member.offer).length,
    demo: room.demo, players: room.players.map(({slot, name, offer}) => ({slot, name, ready: !!offer})),
    self: player ? {slot: player.slot, name: player.name, inventory: player.inventory, offer: player.offer} : null,
    receipt: room.receipt,
  };
}
