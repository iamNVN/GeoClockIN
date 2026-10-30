// Admin dashboard API (/api/admin). Everything except sign-in requires an
// admin session.
import { Router } from 'express';
import { requireAdmin } from '../../auth.js';
import { getSettings } from '../../settings.js';
import attendanceRoutes from './attendance.js';
import authRoutes from './auth.js';
import employeeRoutes from './employees.js';
import overviewRoutes from './overview.js';
import reportRoutes from './reports.js';
import settingsRoutes from './settings.js';

const router = Router();

router.use('/auth', authRoutes);

router.use(requireAdmin);
router.use(async (req, res, next) => {
  req.settings = await getSettings();
  next();
});

router.use('/overview', overviewRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/employees', employeeRoutes);
router.use('/reports', reportRoutes);
router.use('/settings', settingsRoutes);

export default router;
