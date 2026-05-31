const express = require("express");
const { getPool } = require("../config/db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getCounselorSessionAnalytics } = require("../services/counselorAnalytics");
const {
  getFullSchedule,
  getAvailableDateRow,
  slotDurationMatchesSession,
  generateSlotsForCounselor,
  clearAvailabilityForDate,
  toIsoDateKey
} = require("../services/availabilitySchedule");
const { resolveCounselorProfile, deriveBreaksFromWindows } = require("../config/counselorBooking");
const {
  getDaySettings,
  getSessionMinutesForDay,
  upsertDaySetting
} = require("../services/renderingDaySettings");

const router = express.Router();
router.use(requireAuth);

function resolveTargetCounselorId(req) {
  if (req.user.role === "admin") {
    const raw = req.body?.counselorId ?? req.query?.counselorId;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return { error: "counselorId is required for admin." };
    return { id };
  }
  return { id: req.user.id };
}

router.get("/analytics", requireRole("counselor"), async (req, res) => {
  const db = getPool();
  const data = await getCounselorSessionAnalytics(db, req.user.id);
  res.json(data);
});

router.get("/calendar", requireRole("student", "counselor", "admin"), async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  let counselorId = req.user.id;
  if (req.user.role === "admin" || req.user.role === "student") {
    counselorId = Number(req.query.counselorId) || null;
    if (!counselorId) return res.status(400).json({ message: "counselorId is required." });
  }
  const db = getPool();
  const [appointments] = await db.query(
    `SELECT id, appointment_date, appointment_time, status, service_type
     FROM appointments
     WHERE counselor_id = ? AND YEAR(appointment_date) = ?
       AND status IN ('pending','accepted','reschedule_requested')
     ORDER BY appointment_date, appointment_time`,
    [counselorId, year]
  );
  const [unavailable] = await db.query(
    `SELECT id, unavailable_date, start_time, end_time, message
     FROM counselor_unavailabilities
     WHERE counselor_id = ? AND YEAR(unavailable_date) = ?
     ORDER BY unavailable_date, start_time IS NULL DESC, start_time`,
    [counselorId, year]
  );
  const [availableDates] = await db.query(
    `SELECT id, available_date, session_duration_minutes
     FROM counselor_available_dates
     WHERE counselor_id = ? AND YEAR(available_date) = ?
     ORDER BY available_date`,
    [counselorId, year]
  );
  res.json({ year, counselorId, appointments, unavailable, availableDates });
});

router.get("/availability", requireRole("counselor"), async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT id, unavailable_date, start_time, end_time, message
     FROM counselor_unavailabilities
     WHERE counselor_id = ?
     ORDER BY unavailable_date DESC, start_time IS NULL DESC, start_time`,
    [req.user.id]
  );
  res.json(rows);
});

router.get("/availability/:counselorId", requireRole("student", "admin", "counselor"), async (req, res) => {
  const counselorId = Number(req.params.counselorId);
  const db = getPool();
  const [rows] = await db.query(
    `SELECT id, unavailable_date, start_time, end_time, message
     FROM counselor_unavailabilities
     WHERE counselor_id = ?
     ORDER BY unavailable_date DESC, start_time IS NULL DESC, start_time`,
    [counselorId]
  );
  res.json(rows);
});

function normalizeTime(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  return s.length === 5 ? `${s}:00` : s;
}

function timeToMinutes(t) {
  const s = String(t).slice(0, 5);
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function timeRangesOverlap(startA, endA, startB, endB) {
  const a0 = timeToMinutes(startA);
  const a1 = timeToMinutes(endA);
  const b0 = timeToMinutes(startB);
  const b1 = timeToMinutes(endB);
  return a0 < b1 && b0 < a1;
}

router.post("/availability", requireRole("counselor", "admin"), async (req, res) => {
  const target = resolveTargetCounselorId(req);
  if (target.error) return res.status(400).json({ message: target.error });
  const counselorId = target.id;
  const { unavailable_date, message, start_time, end_time } = req.body;
  if (!unavailable_date) return res.status(400).json({ message: "unavailable_date is required" });

  const startT = normalizeTime(start_time);
  const endT = normalizeTime(end_time);
  if ((start_time && !startT) || (end_time && !endT)) {
    return res.status(400).json({ message: "Invalid time format. Use HH:MM (24-hour)." });
  }
  if (startT && endT && startT >= endT) {
    return res.status(400).json({ message: "End time must be after start time." });
  }

  const { isGcoFullDayUnavailability } = require("../config/counselorBooking");
  const db = getPool();
  const isWholeDayBlock = isGcoFullDayUnavailability(startT, endT);
  if (isWholeDayBlock) {
    const [conflicts] = await db.query(
      `SELECT id FROM appointments
       WHERE counselor_id = ? AND appointment_date = ? AND status = 'accepted'
       LIMIT 1`,
      [counselorId, unavailable_date]
    );
    if (conflicts.length > 0) {
      return res.status(409).json({ message: "Cannot set unavailable date with confirmed appointments. Cancel/reschedule first." });
    }
  } else {
    const [conflicts] = await db.query(
      `SELECT id FROM appointments
       WHERE counselor_id = ? AND appointment_date = ? AND status = 'accepted'
         AND appointment_time >= ? AND appointment_time < ?
       LIMIT 1`,
      [counselorId, unavailable_date, startT || "00:00:00", endT || "23:59:59"]
    );
    if (conflicts.length > 0) {
      return res.status(409).json({ message: "Cannot block this time slot — accepted appointment exists. Cancel/reschedule first." });
    }
  }

  try {
    const [result] = await db.query(
      `INSERT INTO counselor_unavailabilities (counselor_id, unavailable_date, start_time, end_time, message)
       VALUES (?, ?, ?, ?, ?)`,
      [counselorId, unavailable_date, startT, endT, message || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "An identical entry already exists." });
    return res.status(500).json({ message: err.message });
  }
});

router.delete("/availability/:id", requireRole("counselor", "admin"), async (req, res) => {
  const availabilityId = Number(req.params.id);
  const db = getPool();
  const [rows] = await db.query(
    "SELECT id, counselor_id FROM counselor_unavailabilities WHERE id = ?",
    [availabilityId]
  );
  if (!rows[0]) return res.status(404).json({ message: "Entry not found" });
  if (req.user.role === "counselor" && rows[0].counselor_id !== req.user.id) {
    return res.status(403).json({ message: "Not authorized" });
  }

  await db.query("DELETE FROM counselor_unavailabilities WHERE id = ?", [availabilityId]);
  res.json({ ok: true });
});

const WEEKDAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function mapRenderingSlots(rows) {
  return rows.map((r) => ({
    id: r.id,
    dayOfWeek: r.day_of_week,
    dayLabel: WEEKDAY_LABELS[r.day_of_week] || `Day ${r.day_of_week}`,
    startTime: String(r.start_time).slice(0, 5),
    endTime: String(r.end_time).slice(0, 5),
    createdAt: r.created_at
  }));
}

router.get("/rendering-schedule", requireRole("counselor"), async (req, res) => {
  const db = getPool();
  const [rows] = await db.query(
    `SELECT id, day_of_week, start_time, end_time, created_at
     FROM counselor_rendering_slots
     WHERE counselor_id = ?
     ORDER BY day_of_week, start_time`,
    [req.user.id]
  );
  const daySettings = await getDaySettings(db, req.user.id);
  res.json({ slots: mapRenderingSlots(rows), daySettings });
});

router.put("/rendering-day-settings", requireRole("counselor"), async (req, res) => {
  const dayOfWeek = Number(req.body.day_of_week);
  const sessionMinutes = Number(req.body.session_duration_minutes);
  if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 6) {
    return res.status(400).json({ message: "day_of_week must be 1 (Monday) through 6 (Saturday)." });
  }
  if (!sessionMinutes || sessionMinutes < 15 || sessionMinutes > 180) {
    return res.status(400).json({ message: "session_duration_minutes must be between 15 and 180." });
  }
  const db = getPool();
  await upsertDaySetting(db, req.user.id, dayOfWeek, sessionMinutes);
  res.json({ ok: true, dayOfWeek, sessionDurationMinutes: sessionMinutes });
});

router.post("/rendering-schedule", requireRole("counselor"), async (req, res) => {
  const dayOfWeek = Number(req.body.day_of_week);
  const startT = normalizeTime(req.body.start_time);
  const endT = normalizeTime(req.body.end_time);

  if (!dayOfWeek || dayOfWeek < 1 || dayOfWeek > 6) {
    return res.status(400).json({ message: "day_of_week must be 1 (Monday) through 6 (Saturday)." });
  }
  if (!startT || !endT) {
    return res.status(400).json({ message: "start_time and end_time are required (HH:MM)." });
  }
  if (startT >= endT) {
    return res.status(400).json({ message: "End time must be after start time." });
  }

  const db = getPool();
  const sessionMinutes = await getSessionMinutesForDay(db, req.user.id, dayOfWeek);
  if (sessionMinutes) {
    if (!slotDurationMatchesSession(startT.slice(0, 5), endT.slice(0, 5), sessionMinutes)) {
      return res.status(400).json({
        message: `Time slot must span exactly ${sessionMinutes} minutes for ${WEEKDAY_LABELS[dayOfWeek]}.`
      });
    }
  }

  const newStart = startT.slice(0, 5);
  const newEnd = endT.slice(0, 5);
  const dayLabel = WEEKDAY_LABELS[dayOfWeek] || "that day";
  const [existing] = await db.query(
    `SELECT start_time, end_time FROM counselor_rendering_slots
     WHERE counselor_id = ? AND day_of_week = ?`,
    [req.user.id, dayOfWeek]
  );
  for (const row of existing) {
    const exStart = String(row.start_time).slice(0, 5);
    const exEnd = String(row.end_time).slice(0, 5);
    if (exStart === newStart) {
      return res.status(409).json({
        message: `A time slot starting at ${newStart} already exists for ${dayLabel}.`
      });
    }
    if (timeRangesOverlap(newStart, newEnd, exStart, exEnd)) {
      return res.status(409).json({
        message: `This time overlaps an existing slot (${exStart}–${exEnd}) on ${dayLabel}.`
      });
    }
  }

  try {
    const [result] = await db.query(
      `INSERT INTO counselor_rendering_slots (counselor_id, day_of_week, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, dayOfWeek, startT, endT]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "This time slot already exists for that day." });
    }
    return res.status(500).json({ message: err.message });
  }
});

router.delete("/rendering-schedule/:id", requireRole("counselor"), async (req, res) => {
  const slotId = Number(req.params.id);
  const db = getPool();
  const [rows] = await db.query(
    "SELECT id, counselor_id FROM counselor_rendering_slots WHERE id = ?",
    [slotId]
  );
  if (!rows[0]) return res.status(404).json({ message: "Slot not found" });
  if (rows[0].counselor_id !== req.user.id) return res.status(403).json({ message: "Not authorized" });

  await db.query("DELETE FROM counselor_rendering_slots WHERE id = ?", [slotId]);
  res.json({ ok: true });
});

router.get("/availability-schedule", requireRole("counselor"), async (req, res) => {
  const db = getPool();
  const schedule = await getFullSchedule(db, req.user.id);
  res.json(schedule);
});

router.get("/availability-schedule/:counselorId", requireRole("student", "admin", "counselor"), async (req, res) => {
  const counselorId = Number(req.params.counselorId);
  const db = getPool();
  const schedule = await getFullSchedule(db, counselorId);
  res.json(schedule);
});

router.post("/available-dates/generate-slots", requireRole("counselor", "admin"), async (req, res) => {
  const target = resolveTargetCounselorId(req);
  if (target.error) return res.status(400).json({ message: target.error });
  const counselorId = target.id;
  const db = getPool();
  const [users] = await db.query("SELECT full_name, email FROM users WHERE id = ?", [counselorId]);
  const u = users[0];
  if (!u) return res.status(404).json({ message: "Counselor not found." });

  const result = await generateSlotsForCounselor(db, counselorId, u.full_name, u.email, req.body);
  if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
  res.status(201).json(result);
});

router.get("/booking-profile", requireRole("counselor"), async (req, res) => {
  const db = getPool();
  const [users] = await db.query("SELECT full_name, email FROM users WHERE id = ?", [req.user.id]);
  const u = users[0];
  if (!u) return res.status(401).json({ message: "User not found." });
  const profile = resolveCounselorProfile(u.full_name, u.email);
  res.json({
    windows: profile.windows,
    sessionMinutes: profile.sessionMinutes,
    lunchBreaks: deriveBreaksFromWindows(profile.windows)
  });
});

router.get("/booking-profile/:counselorId", requireRole("student", "admin", "counselor"), async (req, res) => {
  const counselorId = Number(req.params.counselorId);
  const db = getPool();
  const [users] = await db.query("SELECT full_name, email, role FROM users WHERE id = ?", [counselorId]);
  const u = users[0];
  if (!u || u.role !== "counselor") return res.status(404).json({ message: "Counselor not found." });
  const profile = resolveCounselorProfile(u.full_name, u.email);
  res.json({
    windows: profile.windows,
    sessionMinutes: profile.sessionMinutes,
    lunchBreaks: deriveBreaksFromWindows(profile.windows)
  });
});

router.post("/available-dates", requireRole("counselor"), async (req, res) => {
  if (req.body.day_start && req.body.day_end) {
    const db = getPool();
    const [users] = await db.query("SELECT full_name, email FROM users WHERE id = ?", [req.user.id]);
    const u = users[0];
    if (!u) return res.status(401).json({ message: "User not found." });
    const result = await generateSlotsForCounselor(db, req.user.id, u.full_name, u.email, req.body);
    if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
    return res.status(201).json(result);
  }

  const availableDate = req.body.available_date ? String(req.body.available_date).slice(0, 10) : "";
  const sessionMinutes = Number(req.body.session_duration_minutes) || 60;

  if (!availableDate) return res.status(400).json({ message: "available_date is required (YYYY-MM-DD)." });
  if (sessionMinutes < 15 || sessionMinutes > 180) {
    return res.status(400).json({ message: "session_duration_minutes must be between 15 and 180." });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const picked = new Date(`${availableDate}T00:00:00`);
  if (Number.isNaN(picked.getTime())) return res.status(400).json({ message: "Invalid date." });
  if (picked < today) return res.status(400).json({ message: "Cannot add past dates as available." });

  const db = getPool();
  try {
    const [result] = await db.query(
      `INSERT INTO counselor_available_dates (counselor_id, available_date, session_duration_minutes)
       VALUES (?, ?, ?)`,
      [req.user.id, availableDate, sessionMinutes]
    );
    res.status(201).json({ id: result.insertId, availableDate, sessionDurationMinutes: sessionMinutes });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "This date is already marked as available." });
    }
    return res.status(500).json({ message: err.message });
  }
});

router.patch("/available-dates/:id", requireRole("counselor"), async (req, res) => {
  const id = Number(req.params.id);
  const sessionMinutes = Number(req.body.session_duration_minutes);
  if (!sessionMinutes || sessionMinutes < 15 || sessionMinutes > 180) {
    return res.status(400).json({ message: "session_duration_minutes must be between 15 and 180." });
  }

  const db = getPool();
  const [rows] = await db.query(
    "SELECT id, counselor_id, available_date FROM counselor_available_dates WHERE id = ?",
    [id]
  );
  if (!rows[0]) return res.status(404).json({ message: "Available date not found." });
  if (rows[0].counselor_id !== req.user.id) return res.status(403).json({ message: "Not authorized" });

  await db.query(
    "UPDATE counselor_available_dates SET session_duration_minutes = ? WHERE id = ?",
    [sessionMinutes, id]
  );
  res.json({ ok: true, sessionDurationMinutes: sessionMinutes });
});

router.delete("/available-dates/by-date/:date", requireRole("counselor", "admin"), async (req, res) => {
  const target = resolveTargetCounselorId(req);
  if (target.error) return res.status(400).json({ message: target.error });
  const dateKey = String(req.params.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
  }
  const db = getPool();
  await clearAvailabilityForDate(db, target.id, dateKey);
  res.json({ ok: true, availableDate: dateKey });
});

router.delete("/available-dates/:id", requireRole("counselor"), async (req, res) => {
  const id = Number(req.params.id);
  const db = getPool();
  const [rows] = await db.query(
    "SELECT id, counselor_id, available_date FROM counselor_available_dates WHERE id = ?",
    [id]
  );
  if (!rows[0]) return res.status(404).json({ message: "Available date not found." });
  if (rows[0].counselor_id !== req.user.id) return res.status(403).json({ message: "Not authorized" });

  const dateKey = toIsoDateKey(rows[0].available_date);
  await db.query("DELETE FROM counselor_date_slots WHERE counselor_id = ? AND available_date = ?", [
    req.user.id,
    dateKey
  ]);
  await db.query("DELETE FROM counselor_available_dates WHERE id = ?", [id]);
  res.json({ ok: true });
});

router.post("/available-slots", requireRole("counselor"), async (req, res) => {
  const availableDate = req.body.available_date ? String(req.body.available_date).slice(0, 10) : "";
  const startT = normalizeTime(req.body.start_time);
  const endT = normalizeTime(req.body.end_time);

  if (!availableDate) return res.status(400).json({ message: "available_date is required." });
  if (!startT || !endT) return res.status(400).json({ message: "start_time and end_time are required (HH:MM)." });
  if (startT >= endT) return res.status(400).json({ message: "End time must be after start time." });

  const db = getPool();
  const dateRow = await getAvailableDateRow(db, req.user.id, availableDate);
  if (!dateRow) {
    return res.status(400).json({ message: "Add this date as an available date before setting time slots." });
  }

  const sessionMinutes = dateRow.session_duration_minutes;
  if (!slotDurationMatchesSession(startT.slice(0, 5), endT.slice(0, 5), sessionMinutes)) {
    return res.status(400).json({
      message: `Time slot must span exactly ${sessionMinutes} minutes (e.g. 09:00–${formatEndExample(startT, sessionMinutes)}).`
    });
  }

  const [conflicts] = await db.query(
    `SELECT id FROM appointments
     WHERE counselor_id = ? AND appointment_date = ? AND status = 'accepted'
       AND appointment_time >= ? AND appointment_time < ?
     LIMIT 1`,
    [req.user.id, availableDate, startT, endT]
  );
  if (conflicts.length > 0) {
    return res.status(409).json({ message: "Cannot add slot — accepted appointment exists in this window." });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO counselor_date_slots (counselor_id, available_date, start_time, end_time)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, availableDate, startT, endT]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "This time slot already exists for that date." });
    }
    return res.status(500).json({ message: err.message });
  }
});

function formatEndExample(startT, sessionMinutes) {
  const [h, m] = String(startT).slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + sessionMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

router.delete("/available-slots/:id", requireRole("counselor"), async (req, res) => {
  const slotId = Number(req.params.id);
  const db = getPool();
  const [rows] = await db.query(
    "SELECT id, counselor_id FROM counselor_date_slots WHERE id = ?",
    [slotId]
  );
  if (!rows[0]) return res.status(404).json({ message: "Time slot not found" });
  if (rows[0].counselor_id !== req.user.id) return res.status(403).json({ message: "Not authorized" });

  await db.query("DELETE FROM counselor_date_slots WHERE id = ?", [slotId]);
  res.json({ ok: true });
});

module.exports = router;
