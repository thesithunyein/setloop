const main = document.querySelector('main');
const dialog = document.querySelector('dialog');
const notice = document.querySelector('#notice');
const stamps = ['sun', 'moon', 'star'];
const demoNames = ['Alice', 'Ben', 'Cara'];
const demoKey = code => `setloop-demo-${code}`;
const roomKey = code => `setloop-room-${code}`;
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const capitalize = value => value[0].toUpperCase() + value.slice(1);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = inventory => inventory.filter(amount => amount > 0).length;
const route = location.pathname.split('/').filter(Boolean);
const code = (route[1] || '').toUpperCase();
for (const link of document.querySelectorAll('.site-header nav a')) {
  if (link.pathname === location.pathname && !link.hash) link.setAttribute('aria-current', 'page');
}
const lock = '<svg class="lock" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.6"/></svg>';
const icons = {
  sun: '<circle cx="50" cy="49" r="15" fill="currentColor"/><path d="M50 22v8m0 38v8M23 49h8m38 0h8M31 30l6 6m26 26 6 6m0-38-6 6M37 62l-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  moon: '<path d="M62 26a24 24 0 1 0 11 36 26 26 0 0 1-11-36Z" fill="currentColor"/><path d="M68 37h12m-6-6v12m9 4h6m-3-3v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  star: '<path d="m50 24 6.8 17.8L75 49l-18.2 7.2L50 74l-6.8-17.8L25 49l18.2-7.2L50 24Z" fill="currentColor"/><path d="M72 28h11m-5.5-5.5v11M23 67h10m-5-5v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
};
const ink = {sun:'#a82431', moon:'#402d39', star:'#6c3657'};
const paper = {sun:'#ffe6e5', moon:'#efebef', star:'#f7e7f0'};
let timerId;
let pollId;
let toastId;
let currentRoom;
let token = '';
let offset = 0;
let pending = false;

function stamp(type, extra = '') {
  return `<svg class="stamp ${extra}" viewBox="0 0 100 116" aria-hidden="true" style="color:${ink[type]}"><rect x="4" y="4" width="92" height="108" rx="6" fill="#fff" stroke="#e6dadd" stroke-width="5" stroke-dasharray="1.5 5" stroke-linecap="round"/><rect x="12" y="12" width="76" height="92" rx="3" fill="${paper[type]}"/><rect x="17" y="17" width="66" height="82" rx="2" fill="none" stroke="currentColor" opacity=".43"/><path d="M21 80h58" stroke="currentColor" opacity=".45"/>${icons[type]}<text x="50" y="92" text-anchor="middle" fill="currentColor" font-family="var(--sans)" font-weight="700" font-size="8" letter-spacing="2">${type.toUpperCase()}</text></svg>`;
}

function StampAlbum(inventory, name, {small = false, slot = -1, received} = {}) {
  const heading = small ? 'h3' : 'h2';
  const slots = stamps.map((type, i) => `<div class="stamp-slot ${!inventory[i] ? 'empty ' : ''}${received === type ? 'arrival-slot' : ''}" data-stamp="${type}">
    ${stamp(type)}<span class="stamp-name">${type}</span><small>${inventory[i] ? `×${inventory[i]}` : 'Missing'}</small></div>`);
  return `<section class="panel album" data-album="${slot}"><div class="album-header"><${heading}>${escape(name)}</${heading}><span class="pill ${count(inventory) === 3 ? 'success' : ''}" aria-label="${count(inventory)} of 3 types collected">${count(inventory)}/3</span></div><div class="album-grid">${slots.join('')}</div></section>`;
}

async function api(path, {method = 'GET', body, bearer = token} = {}) {
  const headers = {};
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not reach Setloop. Try again.');
  return data;
}

function toast(message) {
  notice.textContent = message;
  clearTimeout(toastId);
  toastId = setTimeout(() => { notice.textContent = ''; }, 3500);
}

function getStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function saveStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* This tab can still use the session token. */ }
}

function savedDemo(roomCode) {
  try { return JSON.parse(getStorage(demoKey(roomCode))) || []; } catch { return []; }
}

function playerLink(roomCode, value) {
  return `/room/${roomCode}#seat=${encodeURIComponent(value)}`;
}

function session(roomCode) {
  const seat = new URLSearchParams(location.hash.slice(1)).get('seat');
  const key = roomKey(roomCode);
  if (seat && /^[0-9a-f]{64}$/.test(seat)) {
    sessionStorage.setItem(key, seat);
    history.replaceState(null, '', location.pathname);
    return seat;
  }
  return sessionStorage.getItem(key) || getStorage(key) || '';
}

function goToRoom(newCode, seat) {
  saveStorage(roomKey(newCode), seat);
  location.assign(playerLink(newCode, seat));
}

function openDialog(title, content) {
  dialog.innerHTML = `<button class="dismiss" type="button" data-action="dismiss" aria-label="Close dialog">×</button><h2 id="dialog-title">${escape(title)}</h2>${content}`;
  if (!dialog.open) dialog.showModal();
}

function createDialog() {
  openDialog('Start a swap room', `<form class="form-stack" data-form="create">
    <label>Room name <span class="helper">(optional)</span><input name="name" maxlength="40" placeholder="Sunday stamp club" autocomplete="off"></label>
    <label>Your nickname <span class="helper">(optional)</span><input name="nickname" maxlength="24" autocomplete="nickname" placeholder="Player 1"></label>
    <label>Round duration<select name="duration"><option value="1">1 minute</option><option value="3" selected>3 minutes</option><option value="5">5 minutes</option></select></label>
    <p class="helper">The clock starts when the third collector joins.</p><p class="form-error" role="alert"></p><button class="button accent wide">Create room</button></form>`);
}

function renderHome() {
  main.innerHTML = `<section class="hero"><div class="hero-copy"><p class="eyebrow">The stamp swap club</p>
    <h1>One swap.<br><em>Three full sets.</em></h1>
    <p class="hero-lead">Three collectors each offer a duplicate in private. When the offers form a loop, everyone gets the stamp they’re missing.</p>
    <div class="actions"><button class="button accent" data-action="create">Start a swap room <span aria-hidden="true">↗</span></button><button class="button outline" data-action="demo">Open demo room</button></div>
    <form class="home-join" data-form="code"><label>Join with code<input class="code-input" name="code" maxlength="6" minlength="6" required placeholder="ABC234" aria-describedby="join-error" autocomplete="off" autocapitalize="characters" spellcheck="false"></label><button class="button outline">Join <span aria-hidden="true">→</span></button><span id="join-error" class="form-error" role="alert"></span></form>
    <p class="live" id="live" role="status" hidden></p></div>
    <figure class="hero-art"><div class="art-label"><span>Example swap</span><span>Sun · Moon · Star</span></div>
    <div class="stamp-scene" aria-hidden="true"><div class="orbit"></div><span class="art-arrow top">⟶</span><span class="art-arrow left">⟶</span><span class="art-arrow right">⟶</span>${stamps.map(type => stamp(type, 'scene-stamp')).join('')}</div>
    <figcaption class="art-caption"><span>Alice sends Sun to Ben. Ben sends Moon to Cara. Cara sends Star to Alice.</span></figcaption></figure></section>
    <section class="how" id="how"><h2>How it works</h2><div class="how-grid">
      <article><span class="step-marker" aria-hidden="true">1</span><div><h3>Invite two collectors</h3><p>Open a room and share its code.</p></div></article>
      <article><span class="step-marker" aria-hidden="true">2</span><div><h3>Seal your offer</h3><p>Choose a duplicate and a missing stamp. Each collector sees only their own offer.</p></div></article>
      <article><span class="step-marker" aria-hidden="true">3</span><div><h3>Swap together</h3><p>All three trades go through together. Without a match, everyone keeps their stamps.</p></div></article>
    </div></section>
    <section class="faq" id="faq" aria-labelledby="faq-title">
      <div class="faq-intro">
        <h2 id="faq-title">Frequently asked questions</h2>
        <a class="text-link" href="/docs">Read the swap guide <span aria-hidden="true">↗</span></a>
      </div>
      <div class="faq-list">
        <details><summary>How do I join a swap?</summary><p>Open the invite link or enter the six-character room code on the home page. The countdown starts when the third collector joins.</p></details>
        <details><summary>Can I try Setloop on my own?</summary><p>Use <strong>Open demo room</strong> to get three player links. Open Alice, Ben, and Cara in separate tabs, then seal an offer in each tab. Alice can close the round once all three offers are ready.</p></details>
        <details><summary>Who can see my offer?</summary><p>While the round is open, your seat shows your offer. Other collectors see your name and whether you’re ready. Share the room invite with your group and keep your personal seat link private.</p></details>
        <details><summary>Can I change an offer after sealing it?</summary><p>Yes. Reopen your offer and save your updated choices before the round closes.</p></details>
        <details><summary>What happens if there’s no match?</summary><p>Everyone keeps their stamps. The public receipt records the outcome without revealing unmatched offers.</p></details>
        <details><summary>How do I verify a completed swap?</summary><p>Open the public receipt from the round results or look up the room code on <a href="/verify">Verify a trade</a>. The receipt shows the outcome, any transfers, and the settlement source.</p></details>
      </div>
    </section>`;
  api('/status').then(data => {
    const live = document.querySelector('#live');
    if (live && data.open > 0) {
      live.innerHTML = `<span class="dot"></span>${data.open} ${data.open === 1 ? 'room' : 'rooms'} open`;
      live.hidden = false;
    }
  }).catch(() => {
    const live = document.querySelector('#live');
    if (live) {
      live.textContent = 'Swap rooms are temporarily unavailable.';
      live.classList.add('unavailable');
      live.hidden = false;
    }
  });
}

function RoomTimer(room) {
  return `<span class="timer" data-timer>${room.deadline ? '—' : 'Waiting to start'}</span>`;
}

function updateTimer() {
  const target = document.querySelector('[data-timer]');
  if (!target || currentRoom.status !== 'open') return;
  const seconds = Math.max(0, Math.ceil((currentRoom.deadline - Date.now() - offset) / 1000));
  target.textContent = seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Matching…';
  target.classList.toggle('urgent', seconds <= 30);
}

function offerForm(room) {
  const {inventory, offer} = room.self;
  const options = (k, match) => stamps.map((type, index) => match(inventory[index]) ? `<option value="${type}" ${offer?.[k] === type ? 'selected' : ''}>${capitalize(type)}</option>` : '').join('');
  return `<form class="offer-form" data-form="offer"><label>Give<select name="give" required>${options('give', n => n > 1)}</select></label><label>Need<select name="need" required>${options('need', n => n === 0)}</select></label><p class="form-error" role="alert"></p><button class="button accent wide">${offer ? 'Update sealed offer' : 'Lock in offer'} ${lock}</button></form>`;
}

function OfferSelector(room) {
  const {offer} = room.self;
  return `<section class="panel offer"><h2>Your offer</h2><p class="helper">${lock} Other collectors see your ready status while the room is open.</p>${room.status === 'open' ? `
    <div class="desktop-offer">${offerForm(room)}</div><button class="button accent wide mobile-offer" data-action="offer-sheet">${offer ? 'Review sealed offer' : 'Choose an offer'} ${lock}</button>
    ${offer ? '<p class="sealed" role="status">✓ Your offer is sealed. You can update it until close.</p>' : ''}` : '<p>Offers open when the third collector joins.</p>'}</section>`;
}

function demoPanel(room) {
  const seats = room.demo ? savedDemo(room.code) : [];
  return seats.length ? `<aside class="demo-panel"><p><strong>Judge demo</strong> <span class="helper">Open each seat in a separate tab, then seal one offer per player.</span></p><div class="actions">${seats.map((seat, i) => `<a class="button outline compact" target="_blank" rel="noopener" href="${playerLink(room.code, seat)}">Open ${demoNames[i]} ↗</a>`).join('')}</div></aside>` : '';
}

function renderRoom(room) {
  if (room.receipt) {
    clearInterval(timerId);
    clearInterval(pollId);
    renderResult(room.receipt);
    return;
  }
  const players = Array.from({length:3}, (_, i) => room.players[i]);
  main.innerHTML = `<div class="view"><header class="room-head"><div><p class="eyebrow">Swap room</p><h1>${escape(room.name || 'Stamp swap')}</h1><p class="muted">Room <strong class="mono">${room.code}</strong> · ${room.duration} ${room.duration === 1 ? 'minute' : 'minutes'}</p></div>
    <div class="actions">${RoomTimer(room)}<button class="button outline compact" data-action="copy-room">Copy invite link</button></div></header>
    ${demoPanel(room)}
    ${room.self ? `<div class="room-grid">${StampAlbum(room.self.inventory, 'Your album')}${OfferSelector(room)}</div>` : `<section class="panel single-column"><h2>Join this room</h2><p class="helper">Room ${room.code} has ${3 - room.players.length} open ${room.players.length === 2 ? 'seat' : 'seats'}.</p>${room.status === 'waiting' ? '<form class="form-stack" data-form="join"><label>Your nickname <span class="helper">(optional)</span><input name="nickname" maxlength="24" placeholder="Choose a nickname" autocomplete="nickname"></label><p class="form-error" role="alert"></p><button class="button accent">Join this room</button></form>' : '<p>This room is full. If you have a demo seat link, open it in this browser.</p>'}</section>`}
    <section class="panel participants"><div class="album-header"><h2>Collectors</h2><span class="pill">${room.ready} of 3 ready</span></div><div class="people">${players.map(player => `<div class="person"><span class="avatar" aria-hidden="true">${player ? escape(Array.from(player.name)[0].toUpperCase()) : '—'}</span><span><strong>${player ? escape(player.name) : 'Open seat'}${player && room.self?.slot === player.slot ? ' (you)' : ''}</strong><small>${player ? player.ready ? '✓ Ready' : 'Choosing' : 'Waiting to join'}</small></span></div>`).join('')}</div></section>
    <div class="room-bottom actions">${room.self?.slot === 0 && room.status === 'open' ? `<button class="button" data-action="close-round" ${room.ready !== 3 ? 'disabled' : ''}>Close room early</button>` : ''}<span class="helper">${room.status === 'waiting' ? 'The timer starts when the room is full.' : 'The round closes automatically when the timer ends.'}</span></div></div>`;
  updateTimer();
}

function MatchAnimation(receipt) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || typeof Element.prototype.animate !== 'function') return;
  for (const [i, transfer] of receipt.transfers.entries()) {
    const selector = slot => `[data-album="${slot}"] [data-stamp="${transfer.stamp}"] .stamp`;
    const source = document.querySelector(selector(transfer.from));
    const destination = document.querySelector(selector(transfer.to));
    if (!source || !destination) continue;
    const from = source.getBoundingClientRect();
    const to = destination.getBoundingClientRect();
    const piece = source.cloneNode(true);
    piece.classList.add('motion-piece');
    Object.assign(piece.style, {left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,opacity:'0'});
    document.body.append(piece);
    const movement = piece.animate([
      {transform:'translate(0, 0) rotate(-6deg)',opacity:0},
      {transform:`translate(${(to.left-from.left)*.56}px, ${(to.top-from.top)*.6 - 35}px) rotate(10deg)`,opacity:1,offset:.58},
      {transform:`translate(${to.left-from.left}px, ${to.top-from.top}px) rotate(0deg)`,opacity:1},
    ], {duration:700,delay:i*110,easing:'cubic-bezier(.2,.65,.24,1)'});
    movement.onfinish = () => { piece.remove(); destination.closest('.stamp-slot').classList.add('arrived'); };
  }
}

function renderResult(receipt) {
  const match = receipt.result === 'matched';
  main.innerHTML = `<div class="view"><section class="result panel ${receipt.result}"><p class="eyebrow">Room ${receipt.code} · Round closed</p>
    <span class="pill ${match ? 'success' : 'warning'}">${match ? '✓ Match found' : 'No match'}</span><h2>${match ? 'All three sets completed.' : 'Everyone keeps their pieces.'}</h2>
    <p class="muted">${match ? 'Three collectors finished their albums in one trade.' : 'No three-way cycle was available when the round closed.'}</p><div class="results-grid">${receipt.players.map(player => {
      const transfer = receipt.transfers.find(item => item.to === player.slot);
      return StampAlbum(player.after, player.name, {small:true,slot:player.slot,received:transfer?.stamp});
    }).join('')}</div><div class="actions"><a class="button accent" href="/receipt/${receipt.code}">View public receipt ↗</a><button class="button outline" data-action="create">Start another room</button></div></section></div>`;
  if (match) requestAnimationFrame(() => MatchAnimation(receipt));
}

function verifyReceipt(record) {
  const claimed = record.receipt;
  const participants = claimed.players.map(player => [...player.before]);
  if (claimed.result === 'matched') {
    if (participants.length !== 3 || claimed.transfers.length !== 3 || new Set(claimed.transfers.map(t => t.from)).size !== 3 || new Set(claimed.transfers.map(t => t.to)).size !== 3) return false;
    for (const {from,to,stamp:piece} of claimed.transfers) {
      const index = stamps.indexOf(piece);
      if (index < 0 || from === to || !participants[from] || !participants[to] || claimed.players[from].before[index] < 2 || claimed.players[to].before[index] !== 0) return false;
      participants[from][index]--;
      participants[to][index]++;
    }
  } else if (claimed.result !== 'no-match' || claimed.transfers.length !== 0) return false;
  return participants.every((inventory, i) => inventory.every((amount, j) => amount === claimed.players[i].after[j]));
}

async function PublicReceipt(roomCode) {
  const record = await api(`/rooms/${roomCode}/receipt`, {bearer:''});
  const {receipt,digest} = record;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(receipt)));
  const actualDigest = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2,'0')).join('');
  const verified = actualDigest === digest && verifyReceipt(record);
  const matched = receipt.result === 'matched';
  const timestamp = new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(receipt.closedAt);
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><p class="eyebrow">Public trade record</p><h1>Swap receipt</h1><p class="muted">Anyone with the link can inspect this round.</p></div><article class="panel">
    <dl class="receipt-data"><div><dt>Room</dt><dd class="mono">${receipt.code}</dd></div><div><dt>Closed</dt><dd>${escape(timestamp)}</dd></div><div><dt>Outcome</dt><dd><span class="pill ${matched ? 'success' : 'warning'}">${matched ? 'Matched' : 'No match'}</span></dd></div></dl>
    ${matched ? `<h3>Three completed transfers</h3><ul class="receipt-list">${receipt.transfers.map(({from,to,stamp:piece}) => `<li>${stamp(piece)}<span><strong>${escape(receipt.players[from].name)}</strong> sent ${capitalize(piece)} to <strong>${escape(receipt.players[to].name)}</strong>.</span></li>`).join('')}</ul>` : '<p>No stamps moved. Each inventory matches its pre-round balance.</p>'}
    <div class="integrity"><p><span class="pill ${verified ? 'success' : 'warning'}">${verified ? '✓ Receipt checks passed' : 'Receipt checks failed'}</span></p><p class="helper">The browser recalculates the transfer balances and receipt digest. Unmatched offers are excluded from the public record.</p><p class="mono small">${escape(digest)}</p></div>
    <p class="state-label">Settlement source: ${receipt.chain ? 'MagicBlock · Solana devnet' : 'Setloop server ledger'}</p><div class="actions"><button class="button outline compact" data-action="copy-receipt">Copy receipt link</button>${receipt.chain ? `<a class="text-link" href="/devnet/${escape(receipt.chain.address)}">Verify on Solana ↗</a>${receipt.chain.signature ? `<a class="text-link" target="_blank" rel="noopener" href="https://explorer.solana.com/tx/${escape(receipt.chain.signature)}?cluster=devnet">Settlement transaction ↗</a>` : ''}` : '<a class="text-link" href="/verify">Verify another trade</a>'}</div></article></div>`;
}

function renderVerify() {
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><p class="eyebrow">Trade records</p><h1>Verify a trade</h1><p class="muted">Look up a completed round by room code or Solana devnet address.</p></div><section class="panel"><form class="form-stack" data-form="receipt"><label>Room code or devnet address<input type="text" name="code" autocomplete="off" maxlength="44" minlength="6" spellcheck="false" required placeholder="ABC234 or a Solana address"></label><p class="form-error" role="alert"></p><button class="button accent">Find receipt</button></form></section></div>`;
}

async function renderDevnetReceipt(address) {
  const receipt = await api(`/devnet/${address}`,{bearer:''});
  const matched = receipt.result === 'matched';
  const short = value => `${value.slice(0,5)}…${value.slice(-4)}`;
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><p class="eyebrow">Solana devnet</p><h1>Swap receipt</h1><p class="muted">Read from the committed Setloop program account.</p></div><article class="panel"><p><span class="pill ${matched ? 'success' : 'warning'}">${matched ? '✓ Matched' : 'No match'}</span></p><p class="mono small">${escape(receipt.address)}</p><p class="helper">${escape(new Date(receipt.closedAt).toLocaleString())}</p>${matched ? `<ul class="receipt-list">${receipt.transfers.map(({from,to,stamp:piece}) => `<li>${stamp(piece.toLowerCase())}<span><strong>${escape(short(from))}</strong> sent ${escape(piece)} to <strong>${escape(short(to))}</strong>.</span></li>`).join('')}</ul>` : '<p>No stamp transfers were recorded.</p>'}<div class="actions"><a class="button accent" target="_blank" rel="noopener" href="https://explorer.solana.com/address/${escape(receipt.address)}?cluster=devnet">Solana Explorer ↗</a><a class="text-link" href="/verify">Verify another trade</a></div></article></div>`;
}

async function renderCollection() {
  const codes = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('setloop-room-')) codes.push(key.slice(13));
  }
  const records = await Promise.allSettled(codes.map(item => api(`/rooms/${item}`,{bearer:getStorage(roomKey(item))})));
  const rooms = records.flatMap(result => result.status === 'fulfilled' && result.value.room.self ? [result.value.room] : []);
  const latest = rooms.filter(room => room.receipt).sort((a,b) => b.receipt.closedAt-a.receipt.closedAt);
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><p class="eyebrow">Your stamp club</p><h1>Collection</h1><p class="muted">Albums and trade records for player seats saved in this browser.</p></div><div class="collection-list">${rooms.length ? rooms.map(room => StampAlbum(room.self.inventory, room.name || `Room ${room.code}`, {small:true})).join('') : '<section class="panel"><h3>No albums yet</h3><p>Join or create a room to get your first stamp set.</p><a href="/" class="button accent">Find a room</a></section>'}${latest.length ? `<section class="panel"><h2>Trade history</h2>${latest.map(room => `<a class="history-row" href="/receipt/${room.code}"><span>${escape(room.name || room.code)}</span><span class="pill ${room.status === 'matched' ? 'success' : 'warning'}">${room.status === 'matched' ? 'Matched' : 'No match'} ↗</span></a>`).join('')}</section>` : ''}</div></div>`;
}

async function renderDocs() {
  const mode = await api('/status').then(value=>value.mode).catch(()=>null);
  const ledger = mode === 'devnet' ? 'This instance uses a MagicBlock Private Ephemeral Rollup and commits its public room result to Solana devnet. The receipt links to the committed account.' : mode === 'server' ? 'This instance uses the Setloop server ledger. Receipt checks describe that ledger.' : 'The active ledger could not be confirmed. The settlement source is also shown on each receipt.';
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><p class="eyebrow">Setloop guide</p><h1>How rounds work</h1></div><article class="panel"><h3>Seats and timing</h3><p>Invite two other collectors with the room code. When the third seat fills, the selected countdown begins. The host can close early if all three offers are sealed.</p><h3>Offers and settlement</h3><p>Each collector can offer one duplicate and request a missing stamp. A matching cycle moves each offered stamp to the collector who requested it. If the round closes without a cycle, the inventories stay as they were.</p><h3>Privacy and receipts</h3><p>Each player link grants access to one seat. Keep that link private. A room invite link can be shared. While a round is open, other seats can see only the names and ready statuses. Anyone can view a closed-round receipt.</p><h3>Settlement source</h3><p>${ledger}</p><a class="text-link" href="/verify">Look up a receipt ↗</a></article></div>`;
}

function acceptRoom(room) {
  offset = room.time - Date.now();
  const before = currentRoom && JSON.stringify({...currentRoom,time:0});
  const next = JSON.stringify({...room,time:0});
  if (before === next) return;
  currentRoom = room;
  if (room.receipt && dialog.open && dialog.classList.contains('offer-sheet')) dialog.close();
  renderRoom(room);
}

async function refreshRoom() {
  if (pending) return;
  try { acceptRoom((await api(`/rooms/${code}`)).room); }
  catch (error) { if (!currentRoom) throw error; }
}

function handleError(error) {
  main.innerHTML = `<section class="view single-column"><div class="panel"><h2>Couldn’t open this page</h2><p class="muted">${escape(error.message)}</p><div class="actions"><button data-action="retry" class="button">Try again</button><a class="button outline" href="/">Back home</a></div></div></section>`;
}

async function action(button, work) {
  if (pending) return;
  pending = true;
  button.disabled = true;
  button.setAttribute('aria-busy','true');
  try { return await work(); }
  finally { pending = false; if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); } }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const type = button.dataset.action;
  if (type === 'create') createDialog();
  if (type === 'offer-sheet' && currentRoom?.status === 'open') {
    dialog.classList.add('offer-sheet');
    openDialog('Choose an offer',offerForm(currentRoom));
  }
  if (type === 'dismiss') dialog.close();
  if (type === 'retry') location.reload();
  if (type === 'copy-room' || type === 'copy-receipt') {
    const path = type === 'copy-room' ? `/room/${code}` : `/receipt/${code}`;
    navigator.clipboard.writeText(new URL(path,location.origin).href).then(() => toast('Link copied.')).catch(() => toast('Copy the room or receipt URL from your address bar.'));
  }
  if (type === 'demo') action(button, async () => {
    const data = await api('/demo',{method:'POST'});
    saveStorage(demoKey(data.room.code),JSON.stringify(data.demoTokens));
    goToRoom(data.room.code,data.token);
  }).catch(error => toast(error.message));
  if (type === 'close-round') action(button, async () => {
    button.textContent = 'Finding a cycle…';
    try { acceptRoom((await api(`/rooms/${code}/close`,{method:'POST'})).room); }
    finally { if (button.isConnected) button.textContent = 'Close room early'; }
  }).catch(error => toast(error.message));
});

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const errorBox = form.querySelector('.form-error');
  const type = form.dataset.form;
  if (type === 'code' || type === 'receipt') {
    if (type === 'receipt' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.code.trim())) { location.assign(`/devnet/${data.code.trim()}`); return; }
    const parsed = data.code.trim().toUpperCase();
    if (!codePattern.test(parsed)) { errorBox.textContent = 'Enter a valid six-character room code.'; return; }
    location.assign(`/${type === 'receipt' ? 'receipt' : 'room'}/${parsed}`);
    return;
  }
  if (errorBox) errorBox.textContent = '';
  action(event.submitter || form.querySelector('button'), async () => {
    if (type === 'create') { const result = await api('/rooms',{method:'POST',body:data}); goToRoom(result.room.code,result.token); }
    if (type === 'join') {
      const result = await api(`/rooms/${code}/join`,{method:'POST',body:data});
      if (result.token) { token = result.token; sessionStorage.setItem(roomKey(code),token); saveStorage(roomKey(code),token); }
      acceptRoom(result.room);
    }
    if (type === 'offer') {
      const {room} = await api(`/rooms/${code}/offer`,{method:'POST',body:data});
      if (form.closest('dialog')) dialog.close();
      acceptRoom(room);
    }
  }).catch(error => { if (errorBox) errorBox.textContent = error.message; else toast(error.message); });
});

dialog.addEventListener('close',()=>dialog.classList.remove('offer-sheet'));

try {
  if (!route.length) renderHome();
  else if (route[0] === 'verify') renderVerify();
  else if (route[0] === 'docs') await renderDocs();
  else if (route[0] === 'collection') await renderCollection();
  else if (route[0] === 'devnet' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(route[1] || '')) await renderDevnetReceipt(route[1]);
  else if (route[0] === 'receipt' && codePattern.test(code)) await PublicReceipt(code);
  else if (route[0] === 'room' && codePattern.test(code)) {
    token = session(code);
    await refreshRoom();
    if (!currentRoom.receipt) {
      timerId = setInterval(updateTimer, 250);
      pollId = setInterval(() => refreshRoom().catch(() => {}), 1000);
    }
  } else throw new Error('This Setloop page could not be found.');
} catch (error) { handleError(error); }
