import { Router } from 'express';
import { listEmployees } from '../../employees.js';
import { buildDayRows, departmentBreakdown, recentActivity, summarizeDayRows } from '../../lib/adminStats.js';
import { holidayOn } from '../../lib/attendance.js';
import { addDays } from '../../lib/time.js';
import { dateParam, loadRecords, officeNow, rowJson } from './common.js';

const router = Router();
const TREND_DAYS = 7;

// Dashboard: KPIs for a date, the 7-day trend, departments and recent activity.
router.get('/', async (req, res) => {
  const { schedule } = req.settings;
  const { date: today, secondsOfDay } = officeNow(req.settings);
  const date = dateParam(req.query.date, today, { today });
  const from = addDays(date, -(TREND_DAYS - 1));

  const [employees, records] = await Promise.all([listEmployees(), loadRecords(from, date)]);
  const context = { employees, records, today, secondsOfDay, schedule };
  const rows = buildDayRows({ date, ...context });

  const trend = [];
  for (let d = from; d <= date; d = addDays(d, 1)) {
    const s = summarizeDayRows(buildDayRows({ date: d, ...context }));
    trend.push({ date: d, present: s.onTime, late: s.late, absent: s.absent + s.pending });
  }

  res.json({
    date,
    today,
    holiday: holidayOn(date, schedule),
    kpis: summarizeDayRows(rows),
    trend,
    departments: departmentBreakdown(rows),
    recent: recentActivity(rows).map(rowJson),
    office: { name: req.settings.office.name, radiusMeters: req.settings.office.radiusMeters },
    activeEmployees: employees.filter((e) => e.active).length,
  });
});

export default router;
