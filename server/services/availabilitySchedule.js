const {
  hhmmToMinutes,
  resolveCounselorProfile,
  deriveBreaksFromWindows,
  generateConsecutiveSlots
} = require("../config/counselorBooking");

/** Normalize MySQL DATE / ISO strings to YYYY-MM-DD (avoids "Mon May 25" keys). */
function toIsoDateKey(val) {
  if (val == null || val === "") return "";
  if (typeof val === "string") {
    const m = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getUTCFullYear();
      const mo = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const d = String(parsed.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${d}`;
    }
    return val.slice(0, 10);
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const mo = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return String(val).slice(0, 10);
}

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
    const key = toIsoDateKey(s.available_date);
    if (!slotsByDate.has(key)) slotsByDate.set(key, []);
    slotsByDate.get(key).push(s);
  }

  return dates.map((d) => {
    const dateKey = toIsoDateKey(d.available_date);
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

function normalizeHHMM(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  return s.length === 5 ? `${s}:00` : s.slice(0, 8);
}

/**
 * Replace all slots for a date with consecutive slots (morning + afternoon, lunch skipped).
 */
async function clearAvailabilityForDate(db, counselorId, availableDate) {
  const dateKey = toIsoDateKey(availableDate);
  await db.query("DELETE FROM counselor_date_slots WHERE counselor_id = ? AND available_date = ?", [
    counselorId,
    dateKey
  ]);
  await db.query("DELETE FROM counselor_available_dates WHERE counselor_id = ? AND available_date = ?", [
    counselorId,
    dateKey
  ]);
  return { ok: true, availableDate: dateKey };
}

async function generateAndReplaceDateSlots(db, counselorId, counselorProfile, options) {
  const {
    availableDate,
    sessionMinutes,
    dayStart,
    dayEnd,
    applyLunchBreak = true,
    slotIntervalMinutes = 0
  } = options;

  const startNorm = normalizeHHMM(dayStart);
  const endNorm = normalizeHHMM(dayEnd);
  if (!startNorm || !endNorm) {
    return { ok: false, status: 400, message: "day_start and day_end are required (HH:MM)." };
  }
  if (startNorm >= endNorm) {
    return { ok: false, status: 400, message: "End time must be after start time." };
  }

  const breaks = applyLunchBreak ? deriveBreaksFromWindows(counselorProfile.windows) : [];
  const interval = Math.max(0, Number(slotIntervalMinutes) || 0);
  if (interval > 120) {
    return { ok: false, status: 400, message: "slot_interval_minutes must be between 0 and 120." };
  }

  const generated = generateConsecutiveSlots(
    startNorm.slice(0, 5),
    endNorm.slice(0, 5),
    sessionMinutes,
    breaks,
    interval
  );

  if (!generated.length) {
    return {
      ok: false,
      status: 400,
      message: "No slots fit in this range with the chosen session length and breaks."
    };
  }

  for (const slot of generated) {
    const [conflicts] = await db.query(
      `SELECT id FROM appointments
       WHERE counselor_id = ? AND appointment_date = ? AND status = 'accepted'
         AND appointment_time >= ? AND appointment_time < ?
       LIMIT 1`,
      [counselorId, availableDate, `${slot.start}:00`, `${slot.end}:00`]
    );
    if (conflicts.length > 0) {
      return {
        ok: false,
        status: 409,
        message: `Cannot generate slots — accepted appointment exists during ${slot.start}–${slot.end}. Cancel or reschedule first.`
      };
    }
  }

  await db.query(
    `INSERT INTO counselor_available_dates (counselor_id, available_date, session_duration_minutes)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE session_duration_minutes = VALUES(session_duration_minutes)`,
    [counselorId, availableDate, sessionMinutes]
  );

  await db.query("DELETE FROM counselor_date_slots WHERE counselor_id = ? AND available_date = ?", [
    counselorId,
    availableDate
  ]);

  for (const slot of generated) {
    await db.query(
      `INSERT INTO counselor_date_slots (counselor_id, available_date, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [counselorId, availableDate, `${slot.start}:00`, `${slot.end}:00`]
    );
  }

  const dateRow = await getAvailableDateRow(db, counselorId, availableDate);
  return {
    ok: true,
    availableDateId: dateRow?.id,
    sessionDurationMinutes: sessionMinutes,
    slotsCreated: generated.length,
    slots: generated.map((s) => ({ startTime: s.start, endTime: s.end })),
    lunchBreaks: breaks.map((b) => ({ start: b.start, end: b.end }))
  };
}

function normalizeDateList(body) {
  if (Array.isArray(body.available_dates) && body.available_dates.length) {
    return [...new Set(body.available_dates.map((d) => toIsoDateKey(d)).filter(Boolean))];
  }
  if (body.available_date) return [toIsoDateKey(body.available_date)];
  return [];
}

async function generateSlotsForCounselor(db, counselorId, counselorName, counselorEmail, body) {
  const dates = normalizeDateList(body);
  const sessionMinutes = Number(body.session_duration_minutes) || 60;
  const applyLunchBreak = body.apply_lunch_break !== false;
  const slotIntervalMinutes = Number(body.slot_interval_minutes) || 0;

  if (!dates.length) {
    return { ok: false, status: 400, message: "Select at least one date (available_date or available_dates)." };
  }
  if (sessionMinutes < 15 || sessionMinutes > 180) {
    return { ok: false, status: 400, message: "session_duration_minutes must be between 15 and 180." };
  }
  if (slotIntervalMinutes < 0 || slotIntervalMinutes > 120) {
    return { ok: false, status: 400, message: "slot_interval_minutes must be between 0 and 120." };
  }
  if (!body.day_start || !body.day_end) {
    return { ok: false, status: 400, message: "day_start and day_end are required." };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const availableDate of dates) {
    const picked = new Date(`${availableDate}T00:00:00`);
    if (Number.isNaN(picked.getTime())) {
      return { ok: false, status: 400, message: `Invalid date: ${availableDate}` };
    }
    if (picked < today) {
      return { ok: false, status: 400, message: `Cannot set availability for past date: ${availableDate}` };
    }
  }

  const profile = resolveCounselorProfile(counselorName, counselorEmail);
  const results = [];
  let totalSlots = 0;

  for (const availableDate of dates) {
    const result = await generateAndReplaceDateSlots(db, counselorId, profile, {
      availableDate,
      sessionMinutes,
      dayStart: body.day_start,
      dayEnd: body.day_end,
      applyLunchBreak,
      slotIntervalMinutes
    });
    if (!result.ok) return result;
    results.push({ availableDate, slotsCreated: result.slotsCreated });
    totalSlots += result.slotsCreated;
  }

  return {
    ok: true,
    datesProcessed: dates.length,
    slotsCreated: totalSlots,
    results,
    lunchBreaks: deriveBreaksFromWindows(profile.windows).map((b) => ({ start: b.start, end: b.end }))
  };
}

module.exports = {
  toIsoDateKey,
  getAvailableDates,
  counselorUsesDateAvailability,
  getAvailableDateRow,
  getDateSlotsForDate,
  getFullSchedule,
  slotDurationMatchesSession,
  clearAvailabilityForDate,
  generateAndReplaceDateSlots,
  generateSlotsForCounselor
};
