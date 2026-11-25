export const SCHEMA = `CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL,
  created INTEGER NOT NULL,
  status TEXT NOT NULL,
  deadline INTEGER
);`;

export function roomStore(database) {
  return {
    async get(code) {
      const row = await database.first('SELECT version, state FROM rooms WHERE code = ?', code);
      return row ? {version: row.version, room: JSON.parse(row.state)} : null;
    },
    async create(room, now) {
      return await database.run('INSERT OR IGNORE INTO rooms(code, state, created, status, deadline) VALUES (?, ?, ?, ?, ?)',
        room.code, JSON.stringify(room), now, room.status, room.deadline) === 1;
    },
    async update(room, version) {
      return await database.run('UPDATE rooms SET version = version + 1, state = ?, status = ?, deadline = ? WHERE code = ? AND version = ?',
        JSON.stringify(room), room.status, room.deadline, room.code, version) === 1;
    },
    async openCount(now) {
      const row = await database.first(`SELECT COUNT(*) AS total FROM rooms
        WHERE (status = 'waiting' AND created > ?) OR (status = 'open' AND deadline > ?)`, now - 300_000, now);
      return row.total;
    },
  };
}
