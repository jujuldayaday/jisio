const { hhmmToMinutes } = require("../config/counselorBooking");

async function getAvailableDates(db, counselorId) {
  const [rows] = await db.query(
    `SELECT id, available_date, session_duration_minutes, created_at
     FROM counselor_available_dates
     WHERE counselor_id = ?
     ORDER BY available_date`,
    [counselorId]
  );
  return rows;
}

async function counselorUsesDateAvailability(db, counselorId) {
  const [rows] = await db.query(
    "SELECT 1 FROM counselor_available_dates WHERE counselor_id = ? LIMIT 1",
    [counselorId]
  );
  return rows.length > 0;
}

async function getAvailableDateRow(db, counselorId, isoDate) {
  const [rows] = await db.query(
    `SELECT id, available_date, session_duration_minutes
     FROM counselor_available_dates
     WHERE counselor_id = ? AND available_date = ?`,
    [counselorId, isoDate]
  );
  return rows[0] || null;
}

async function getDateSlotsForDate(db, counselorId, isoDate) {
  const [rows] = await db.query(
    `SELECT id, available_date, start_time, end_time
     FROM counselor_date_slots
     WHERE counselor_id = ? AND available_date = ?
     ORDER BY start_time`,
    [counselorId, isoDate]
  );
  return rows;
}

async function getFullSchedule(db, counselorId) {
  const dates = await getAvailableDates(db, counselorId);
  if (!dates.length) return [];

  const [slotRows] = await db.query(
    `SELECT id, available_date, start_time, end_time
     FROM counselor_date_slots
     WHERE counselor_id = ?
     ORDER BY available_date, start_time`,
    [counselorId]
  );

  const slotsByDate = new Map();
  for (const s of slotRows) {
    const key = String(s.available_date).slice(0, 10);
    if (!slotsByDate.has(key)) slotsByDate.set(key, []);
    slotsByDate.get(key).push(s);
  }

  return dates.map((d) => {
    const dateKey = String(d.available_date).slice(0, 10);
    return {
      id: d.id,
      availableDate: dateKey,
      sessionDurationMinutes: d.session_duration_minutes,
      slots: (slotsByDate.get(dateKey) || []).map((s) => ({
        id: s.id,
        startTime: String(s.start_time).slice(0, 5),
        endTime: String(s.end_time).slice(0, 5)
      }))
    };
  });
}

function slotDurationMatchesSession(startTime, endTime, sessionMinutes) {
  const dur = hhmmToMinutes(endTime) - hhmmToMinutes(startTime);
  return dur === sessionMinutes;
}

module.exports = {
  getAvailableDates,
  counselorUsesDateAvailability,
  getAvailableDateRow,
  getDateSlotsForDate,
  getFullSchedule,
  slotDurationMatchesSession
};
