// The office display page (/display). No sign-in: a display is only trusted
// once an admin has approved its key.
import { Router } from 'express';
import { displayStatus } from '../displays.js';

const router = Router();

router.post('/status', async (req, res) => {
  res.json(await displayStatus(req.body?.publicKey));
});

export default router;
