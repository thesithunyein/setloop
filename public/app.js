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
let refreshing = false;
let actionVersion = 0;

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
  if (!response.ok) {
    const error = new Error(response.status === 503 ? 'Online rooms are temporarily unavailable. Try again later or use Practice swap.' : data.error || 'Could not reach Setloop. Try again.');
    error.status = response.status;
    throw error;
  }
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
    try {
      sessionStorage.setItem(key, seat);
      history.replaceState(null, '', location.pathname);
    } catch { /* Keep the signed-in link usable when browser storage is blocked. */ }
    return seat;
  }
  try { return sessionStorage.getItem(key) || getStorage(key) || ''; }
  catch { return getStorage(key) || ''; }
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
    <p class="hero-lead">Play with two friends. Each of you gives away one extra stamp and gets the one you’re missing. No account, wallet, or payment is needed.</p>
    <div class="actions"><button class="button accent" data-action="create">Start a room <span aria-hidden="true">↗</span></button><a class="button outline" href="/practice">Practice on your own</a></div>
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
        <details><summary>Can I try Setloop on my own?</summary><p><a href="/practice">Practice a swap</a> with three sample collectors. It runs in this tab and lets you try both a completed swap and a round where nobody trades.</p></details>
        <details><summary>Who can see my offer?</summary><p>While the round is open, your seat shows your offer. Other collectors see your name and whether you’re ready. Share the room invite with your group and keep your personal seat link private.</p></details>
        <details><summary>Can I change an offer after saving it?</summary><p>Yes. Reopen your offer and save your updated choices before the round ends.</p></details>
        <details><summary>What happens if there’s no match?</summary><p>Everyone keeps their stamps. The public receipt records the outcome without revealing unmatched offers.</p></details>
        <details><summary>Where do I find the result of a swap?</summary><p>Open the public receipt from the results page or enter the room code on <a href="/verify">Find a receipt</a>. The receipt shows whether the swap happened and who got each stamp.</p></details>
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
      live.textContent = 'Online rooms are temporarily unavailable. You can still practice on your own.';
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
  return `<form class="offer-form" data-form="offer"><label>Stamp you’ll give<select name="give" required>${options('give', n => n > 1)}</select></label><label>Stamp you want<select name="need" required>${options('need', n => n === 0)}</select></label><p class="form-error" role="alert"></p><button class="button accent wide">${offer ? 'Save changes' : 'Save my offer'} ${lock}</button></form>`;
}

function OfferSelector(room) {
  const {offer} = room.self;
  return `<section class="panel offer"><h2>Your offer</h2><p class="helper">${lock} Other collectors see your ready status while the room is open.</p>${room.status === 'open' ? `
    <div class="desktop-offer">${offerForm(room)}</div><button class="button accent wide mobile-offer" data-action="offer-sheet">${offer ? 'Review my offer' : 'Choose an offer'} ${lock}</button>
    ${offer ? '<p class="sealed" role="status">✓ Offer saved. You can change it until the round ends.</p>' : ''}` : '<p>You can choose your stamps when the third collector joins.</p>'}</section>`;
}

function demoPanel(room) {
  const seats = room.demo ? savedDemo(room.code) : [];
  return seats.length ? `<aside class="demo-panel"><p><strong>Three-tab demo</strong> <span class="helper">Open each player in a separate tab. Save all three offers, then finish the round from Alice’s tab.</span></p><div class="actions">${seats.map((seat, i) => `<a class="button outline compact" target="_blank" rel="noopener" href="${playerLink(room.code, seat)}">Open ${demoNames[i]} ↗</a>`).join('')}</div></aside>` : '';
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
    ${room.self && !room.demo ? `<div class="room-access"><span>${room.status === 'waiting' ? 'Send the invite link or room code to your friends.' : `You’re playing as <strong>${escape(room.self.name)}</strong>.`}</span><button class="button outline compact" data-action="copy-seat">${lock} Copy my private link</button><a class="text-link" href="/docs#privacy">Which link should I share?</a></div>` : ''}
    ${demoPanel(room)}
    ${room.self ? `<div class="room-grid">${StampAlbum(room.self.inventory, 'Your album')}${OfferSelector(room)}</div>` : `<section class="panel single-column"><h2>Join this room</h2><p class="helper">Room ${room.code} has ${3 - room.players.length} open ${room.players.length === 2 ? 'seat' : 'seats'}.</p>${room.status === 'waiting' ? '<form class="form-stack" data-form="join"><label>Your nickname <span class="helper">(optional)</span><input name="nickname" maxlength="24" placeholder="Choose a nickname" autocomplete="nickname"></label><p class="form-error" role="alert"></p><button class="button accent">Join this room</button></form>' : '<p>This room is full. If you have a demo seat link, open it in this browser.</p>'}</section>`}
    <section class="panel participants"><div class="album-header"><h2>Collectors</h2><span class="pill">${room.ready} of 3 ready</span></div><div class="people">${players.map(player => `<div class="person"><span class="avatar" aria-hidden="true">${player ? escape(Array.from(player.name)[0].toUpperCase()) : '—'}</span><span><strong>${player ? escape(player.name) : 'Open seat'}${player && room.self?.slot === player.slot ? ' (you)' : ''}</strong><small>${player ? player.ready ? '✓ Ready' : 'Choosing' : 'Waiting to join'}</small></span></div>`).join('')}</div></section>
    <p class="connection-note" id="connection-note" role="status" hidden></p>
    <div class="room-bottom actions">${room.self?.slot === 0 && room.status === 'open' ? `<button class="button" data-action="close-round" ${room.ready !== 3 ? 'disabled' : ''}>Finish round early</button>` : ''}<span class="helper">${room.status === 'waiting' ? 'The timer starts when the room is full.' : room.self?.slot === 0 && room.ready < 3 ? 'You can finish early once all three offers are saved. Otherwise, wait for the timer.' : 'The round ends when the timer runs out.'}</span></div></div>`;
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

function renderResult(receipt, practice = false) {
  const match = receipt.result === 'matched';
  main.innerHTML = `<div class="view"><section class="result panel ${receipt.result}"><p class="eyebrow">${practice ? 'Practice swap' : `Room ${receipt.code} · Round ended`}</p>
    <span class="pill ${match ? 'success' : 'warning'}">${match ? '✓ Match found' : 'No match'}</span><h2>${match ? 'All three sets completed.' : 'Everyone keeps their pieces.'}</h2>
    <p class="muted">${match ? 'Three collectors finished their albums in one trade.' : 'The round ended without a match for all three collectors.'}</p><div class="results-grid">${receipt.players.map(player => {
      const transfer = receipt.transfers.find(item => item.to === player.slot);
      return StampAlbum(player.after, player.name, {small:true,slot:player.slot,received:transfer?.stamp});
    }).join('')}</div><div class="actions">${practice ? '<a class="button accent" href="/practice">Practice again</a><a class="button outline" href="/docs#play">Read how to play with friends</a>' : `<a class="button accent" href="/receipt/${receipt.code}">View public receipt ↗</a><button class="button outline" data-action="create">Start another room</button>`}</div>
    ${practice ? '<p class="helper practice-note">This round used sample stamps in this tab. It did not create a saved album or a public receipt.</p>' : ''}</section></div>`;
  const heading = main.querySelector('.result h2');
  heading.tabIndex = -1;
  heading.focus({preventScroll: !practice});
  if (match) requestAnimationFrame(() => MatchAnimation(receipt));
}

async function renderPractice() {
  const {addPlayer, STAMPS, putOffer, settleRoom} = await import('/room-rules.mjs');
  const room = {status:'waiting', duration:3, players:[]};
  const now = Date.now();
  demoNames.forEach(() => addPlayer(room, '', null, now, true));

  main.innerHTML = `<div class="view">
    <div class="page-heading"><p class="eyebrow">One-player practice</p><h1>Practice a swap</h1><p class="muted">Play all three collectors in this tab. Choose who makes an offer, then see what happens to their albums.</p></div>
    <form class="practice" id="practice-round">
      <div class="practice-grid">${room.players.map(player => {
        const give = STAMPS[player.inventory.findIndex(total => total > 1)];
        const need = STAMPS[player.inventory.indexOf(0)];
        return `<div class="practice-card">
          ${StampAlbum(player.inventory, player.name, {small:true,slot:player.slot})}
          <label class="practice-choice"><input type="checkbox" name="offer" value="${player.slot}"><span><strong>Make ${player.name}’s offer</strong><small>Give ${capitalize(give)} · Get ${capitalize(need)}</small></span></label>
        </div>`;
      }).join('')}</div>
      <div class="practice-controls"><div><strong>Can you complete all three albums?</strong><p class="muted">Try making all three offers, or leave one unchecked to see a round without a match.</p></div><button class="button accent" type="submit">See what happens</button></div>
    </form></div>`;

  main.querySelector('#practice-round').addEventListener('submit', event => {
    event.preventDefault();
    const offers = new FormData(event.currentTarget).getAll('offer');
    for (const slot of offers) {
      const player = room.players[Number(slot)];
      putOffer(room, player, STAMPS[player.inventory.findIndex(total => total > 1)], STAMPS[player.inventory.indexOf(0)]);
    }
    settleRoom(room, Date.now());
    renderResult(room.receipt, true);
  });
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
    <div class="integrity"><p><span class="pill ${verified ? 'success' : 'warning'}">${verified ? '✓ Stamps and totals agree' : 'This receipt could not be checked'}</span></p><p class="helper">Setloop checks that the stamps shown match the recorded result.</p><details><summary>Technical details</summary><p class="helper">Your browser recalculates the receipt’s checksum and compares the before and after totals. The checksum checks consistency with the record served by Setloop.</p><p class="mono small">${escape(digest)}</p></details></div>
    <p class="state-label">Settlement source: ${receipt.chain ? 'MagicBlock · Solana devnet' : 'Setloop server ledger'}</p><div class="actions"><button class="button outline compact" data-action="copy-receipt">Copy receipt link</button>${receipt.chain ? `<a class="text-link" href="/devnet/${escape(receipt.chain.address)}">Verify on Solana ↗</a>${receipt.chain.signature ? `<a class="text-link" target="_blank" rel="noopener" href="https://explorer.solana.com/tx/${escape(receipt.chain.signature)}?cluster=devnet">Settlement transaction ↗</a>` : ''}` : '<a class="text-link" href="/verify">Verify another trade</a>'}</div></article></div>`;
}

function renderVerify() {
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><h1>Find a receipt</h1><p class="muted">Enter the six-character room code to see how a finished round ended. Anyone with the code can look it up.</p></div>
    <section class="panel"><form class="form-stack" data-form="receipt"><label>Room code<input type="text" class="code-input" name="code" autocomplete="off" autocapitalize="characters" maxlength="6" minlength="6" spellcheck="false" required placeholder="ABC234"></label><p class="form-error" role="alert"></p><button class="button accent">Find receipt</button></form></section>
    <details class="verify-advanced panel"><summary>Look up a Solana test-network receipt</summary><p class="helper">Use this if Setloop gave you a Solana round address.</p><form class="form-stack" data-form="devnet-receipt"><label>Solana round address<input type="text" name="code" autocomplete="off" maxlength="44" minlength="32" spellcheck="false" required></label><p class="form-error" role="alert"></p><button class="button outline">Look up test receipt</button></form></details></div>`;
}

async function renderDevnetReceipt(address) {
  const receipt = await api(`/devnet/${address}`,{bearer:''});
  const matched = receipt.result === 'matched';
  const short = value => `${value.slice(0,5)}…${value.slice(-4)}`;
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><p class="eyebrow">Solana devnet</p><h1>Swap receipt</h1><p class="muted">Read from the committed Setloop program account.</p></div><article class="panel"><p><span class="pill ${matched ? 'success' : 'warning'}">${matched ? '✓ Matched' : 'No match'}</span></p><p class="mono small">${escape(receipt.address)}</p><p class="helper">${escape(new Date(receipt.closedAt).toLocaleString())}</p>${matched ? `<ul class="receipt-list">${receipt.transfers.map(({from,to,stamp:piece}) => `<li>${stamp(piece.toLowerCase())}<span><strong>${escape(short(from))}</strong> sent ${escape(piece)} to <strong>${escape(short(to))}</strong>.</span></li>`).join('')}</ul>` : '<p>No stamp transfers were recorded.</p>'}<div class="actions"><a class="button accent" target="_blank" rel="noopener" href="https://explorer.solana.com/address/${escape(receipt.address)}?cluster=devnet">Solana Explorer ↗</a><a class="text-link" href="/verify">Verify another trade</a></div></article></div>`;
}

async function renderCollection() {
  const codes = [];
  let storageBlocked = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('setloop-room-') && codePattern.test(key.slice(13))) codes.push(key.slice(13));
    }
  } catch {
    storageBlocked = true;
  }
  const records = await Promise.allSettled(codes.map(item => api(`/rooms/${item}`,{bearer:getStorage(roomKey(item))})));
  const rooms = records.flatMap(result => result.status === 'fulfilled' && result.value.room.self && !result.value.room.demo ? [result.value.room] : []);
  const latest = rooms.filter(room => room.receipt).sort((a,b) => b.receipt.closedAt-a.receipt.closedAt);
  const failed = records.some(record => record.status === 'rejected' && record.reason.status !== 404);
  main.innerHTML = `<div class="view single-column"><div class="page-heading"><h1>My albums</h1><p class="muted">Each room gives you its own stamp album. This page shows the rooms you’ve joined in this browser.</p></div><div class="collection-list">
    ${storageBlocked ? '<section class="panel"><h2>Browser storage is blocked</h2><p>Use your private player link to reopen your album.</p><a class="text-link" href="/docs#privacy">About private player links</a></section>' : ''}
    ${failed ? '<section class="panel"><h2>Some albums couldn’t load</h2><p>Your saved links are still in this browser.</p><button class="button outline" data-action="retry">Try again</button></section>' : ''}
    ${rooms.map(room => `<div class="collection-room">${StampAlbum(room.self.inventory, room.name || `Room ${room.code}`, {small:true})}${room.receipt ? '' : `<a class="text-link" href="/room/${room.code}">Return to room ${room.code} ↗</a>`}</div>`).join('')}
    ${!rooms.length && !failed && !storageBlocked ? '<section class="panel"><h2>No albums yet</h2><p>Start or join a room to get your first album.</p><a href="/" class="button accent">Find a room</a></section>' : ''}
    ${latest.length ? `<section class="panel"><h2>Past swaps</h2>${latest.map(room => `<a class="history-row" href="/receipt/${room.code}"><span>${escape(room.name || room.code)}</span><span class="pill ${room.status === 'matched' ? 'success' : 'warning'}">${room.status === 'matched' ? 'Matched' : 'No match'} ↗</span></a>`).join('')}</section>` : ''}</div></div>`;
}

function renderDocs() {
  const sections = [
    ['quick-start', 'Quick start'],
    ['play', 'Play with friends'],
    ['matching', 'How a match works'],
    ['privacy', 'Links and privacy'],
    ['receipts', 'Albums and receipts'],
    ['troubleshooting', 'Troubleshooting'],
    ['technical', 'Technical details'],
  ];
  main.innerHTML = `<div class="view guide">
    <header class="page-heading"><p class="eyebrow">User guide</p><h1>How to use Setloop</h1><p class="muted">Learn how to finish a stamp set with two friends, practice on your own, and read a swap receipt.</p><div class="actions"><a class="button accent" href="/practice">Try a practice swap</a><a class="button outline" href="/">Go to swap rooms</a></div></header>
    <div class="guide-layout">
      <nav class="guide-nav" aria-label="On this page"><strong>On this page</strong>${sections.map(([id,label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
      <article class="guide-content">
        <section id="quick-start"><h2>Quick start</h2><p>Setloop is a game for three collectors. Your album has places for Sun, Moon, and Star. You start with two different stamps and one extra copy. Offer the extra copy and ask for the stamp you’re missing.</p><p>Setloop stamps are digital game pieces. Playing a room requires a browser and two friends. You don’t need to sign up, pay, or connect a wallet. <a href="/practice">Practice on your own</a> to see both outcomes without using the room service.</p></section>
        <section id="play"><h2>Play with friends</h2>
          <ol><li><strong>Start a room.</strong> Choose <strong>Start a room</strong>, enter an optional room name and nickname, then choose a one-, three-, or five-minute round.</li>
          <li><strong>Invite two people.</strong> Send them the invite link or the six-character room code. They can open the link or enter the code on the home page, choose a nickname, and join. Use a separate browser session for each collector.</li>
          <li><strong>Choose your stamps.</strong> The timer starts when the third collector joins. Open <strong>Your offer</strong>, select the extra stamp you can give and the missing stamp you want, then select <strong>Save my offer</strong>. You can change your offer before the round ends.</li>
          <li><strong>See the result.</strong> When the timer runs out, Setloop checks the offers. The host can finish the round early once all three offers are saved. Open the public receipt from the results page to share the outcome.</li></ol>
        </section>
        <section id="matching"><h2>How a match works</h2><p>A swap works when each collector can send one stamp and get exactly the stamp they asked for. Here’s one complete example.</p>
          <dl class="guide-example"><div><dt>Alice</dt><dd>Gives Sun to Ben and gets Star from Cara.</dd></div><div><dt>Ben</dt><dd>Gives Moon to Cara and gets Sun from Alice.</dd></div><div><dt>Cara</dt><dd>Gives Star to Alice and gets Moon from Ben.</dd></div></dl>
          <p>All three stamps move together. If an offer is missing or the offers don’t form a complete swap, everyone keeps their original stamps. You can start another room and try again.</p></section>
        <section id="privacy"><h2>Links and privacy</h2><dl class="guide-example">
          <div><dt>Room invite or code</dt><dd>Share it with the two people you want to invite. Anyone with it can try to take an open place.</dd></div>
          <div><dt>Private player link</dt><dd>Use <strong>Copy my private link</strong> before the round ends if you need to return in another browser. Anyone who has that link can act as you in that room. Keep it private.</dd></div>
          <div><dt>Public receipt</dt><dd>Anyone with the link or room code can see the finished result, player nicknames, album totals, and any stamp transfers. Unmatched offers stay private.</dd></div>
        </dl><p>While the round is open, each collector sees their own offer. Other collectors can see your nickname and whether you’re ready. Choose a nickname and room name you’re comfortable sharing.</p></section>
        <section id="receipts"><h2>Albums and receipts</h2><p><a href="/collection">My albums</a> lists rooms saved in this browser. Each room has its own album, and a new room starts a fresh set. An album won’t automatically appear on another device. You can reopen your room from your private player link.</p>
          <p><a href="/verify">Find a receipt</a> works for finished rounds. Enter the room code to see whether there was a match and which stamps moved. The receipt also tells you where the result was recorded. Practice rounds stay in the tab and don’t appear in your albums or produce a public receipt.</p></section>
        <section id="troubleshooting"><h2>Troubleshooting</h2><dl class="guide-example">
          <div><dt>The code doesn’t work</dt><dd>Check all six characters or ask the host for a fresh invite link. Setloop codes skip easily confused characters such as O and 0.</dd></div>
          <div><dt>The room is full</dt><dd>Use your private player link if you already joined. If all three places belong to other people, ask the host to start another room.</dd></div>
          <div><dt>The timer hasn’t started</dt><dd>Check the collector list. The countdown begins only when all three people have joined.</dd></div>
          <div><dt>The receipt isn’t ready</dt><dd>Open the room and check whether the round has ended, then try the receipt again.</dd></div>
          <div><dt>Online rooms are unavailable</dt><dd>Try again later. You can still use this guide and run a <a href="/practice">practice swap</a> in your browser.</dd></div>
        </dl></section>
        <section id="technical"><h2>Technical details</h2><p>A regular Setloop receipt is a record served by Setloop. Your browser checks that the recorded transfers agree with the before and after totals and recalculates a checksum, which is a short digital fingerprint of the record.</p><p>If a round was recorded on the Solana test network, its receipt links to that separate record. Use the optional Solana lookup only if you were given a round address. A regular receipt can be found with its room code.</p>
          <h3>Test an online room in three tabs</h3><p>This creates a real online test room with three sample players and a public receipt. Use it to check the room service from one device.</p><button class="button outline" data-action="demo">Open three-tab demo</button></section>
      </article>
    </div>
  </div>`;
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

function acceptRoom(room) {
  offset = room.time - Date.now();
  const before = currentRoom && JSON.stringify({...currentRoom,time:0});
  const next = JSON.stringify({...room,time:0});
  if (before === next) return;
  const joinForm = main.querySelector('form[data-form="join"]');
  const focused = joinForm?.contains(document.activeElement) ? document.activeElement : null;
  currentRoom = room;
  if (room.self && !room.demo && token) saveStorage(roomKey(room.code), token);
  if (room.receipt && dialog.open && dialog.classList.contains('offer-sheet')) dialog.close();
  renderRoom(room);
  const updatedJoinForm = main.querySelector('form[data-form="join"]');
  if (joinForm && updatedJoinForm) {
    updatedJoinForm.replaceWith(joinForm);
    focused?.focus({preventScroll:true});
  }
}

async function refreshRoom() {
  if (pending || refreshing) return;
  refreshing = true;
  const version = actionVersion;
  let message = '';
  try {
    const {room} = await api(`/rooms/${code}`);
    if (version === actionVersion) acceptRoom(room);
  } catch (error) {
    if (!currentRoom) throw error;
    message = 'Connection interrupted. Setloop is trying to reconnect.';
  } finally {
    refreshing = false;
  }
  const note = document.querySelector('#connection-note');
  if (note && note.textContent !== message) {
    note.textContent = message;
    note.hidden = !message;
  }
}

function handleError(error) {
  main.innerHTML = `<section class="view single-column"><div class="panel"><h1>Couldn’t open this page</h1><p class="muted">${escape(error.message)}</p><div class="actions"><button data-action="retry" class="button accent">Try again</button><a class="button outline" href="/">Back home</a>${error.status === 503 ? '<a class="text-link" href="/practice">Practice on your own</a>' : ''}</div></div></section>`;
}

async function action(button, work) {
  if (pending) return;
  pending = true;
  actionVersion++;
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
  if (type === 'copy-room' || type === 'copy-receipt' || type === 'copy-seat') {
    const isPrivate = type === 'copy-seat';
    const path = isPrivate ? playerLink(code, token) : `/${type === 'copy-room' ? 'room' : 'receipt'}/${code}`;
    const link = new URL(path,location.origin).href;
    Promise.resolve().then(() => navigator.clipboard.writeText(link))
      .then(() => toast(isPrivate ? 'Private link copied. Keep it for yourself.' : 'Link copied.'))
      .catch(() => {
        openDialog(isPrivate ? 'Your private player link' : 'Copy this link', `<label>${isPrivate ? 'Keep this link private' : 'Link'}<input readonly value="${escape(link)}"></label>`);
        dialog.querySelector('input').select();
      });
  }
  if (type === 'demo') action(button, async () => {
    const data = await api('/demo',{method:'POST'});
    saveStorage(demoKey(data.room.code),JSON.stringify(data.demoTokens));
    location.assign(playerLink(data.room.code,data.token));
  }).catch(error => toast(error.message));
  if (type === 'close-round') action(button, async () => {
    button.textContent = 'Checking offers…';
    try { acceptRoom((await api(`/rooms/${code}/close`,{method:'POST'})).room); }
    finally { if (button.isConnected) button.textContent = 'Finish round early'; }
  }).catch(error => toast(error.message));
});

document.addEventListener('submit', event => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const errorBox = form.querySelector('.form-error');
  const type = form.dataset.form;
  if (type === 'devnet-receipt') {
    const address = data.code.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) { errorBox.textContent = 'Enter a valid Solana round address.'; return; }
    location.assign(`/devnet/${address}`);
    return;
  }
  if (type === 'code' || type === 'receipt') {
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
      if (result.token) {
        token = result.token;
        try { sessionStorage.setItem(roomKey(code),token); } catch { /* This tab still holds the player link. */ }
      }
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
  else if (route[0] === 'docs') renderDocs();
  else if (route[0] === 'practice') await renderPractice();
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
