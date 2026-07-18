import express from 'express';
import {
  createContactsAuthUrl, exchangeContactsCode,
  saveContactsTokens, clearContactsTokens, listContacts, getContact,
} from '../services/googleContacts.service.js';
import { userStore } from '../models/userStore.js';
import { logger } from '../config/logger.js';

const router = express.Router();

const REDIRECT_URI = () =>
  process.env.GOOGLE_CONTACTS_REDIRECT_URI ||
  `${process.env.PUBLIC_URL || 'http://localhost:3001'}/api/contacts/callback`;

// Public callback — no auth middleware
export async function googleContactsCallbackHandler(req, res) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
  const mobileScheme = process.env.MOBILE_APP_SCHEME || 'mneva';
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${frontendUrl}/settings?contacts=error&msg=${encodeURIComponent(error)}`);
    if (!code)  return res.redirect(`${frontendUrl}/settings?contacts=error&msg=missing_code`);

    let decoded;
    try {
      let s = state.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      decoded = JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
    } catch { return res.redirect(`${frontendUrl}/settings?contacts=error&msg=invalid_state`); }

    const tokens = await exchangeContactsCode(code, REDIRECT_URI());
    const user   = await userStore.getById(decoded.userId);
    if (!user) return res.redirect(`${frontendUrl}/settings?contacts=error&msg=user_not_found`);

    // Get email from token
    let email = user.email;
    try {
      const { google } = await import('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, REDIRECT_URI()
      );
      oauth2Client.setCredentials(tokens);
      const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client });
      const info = await oauth2Api.userinfo.get();
      email = info.data.email || email;
    } catch {}

    await saveContactsTokens(user.id, tokens, email);
    logger.info(`Google Contacts connected for user ${user.id}`);

    // Emit real-time socket event so mobile/web updates instantly
    try {
      const io = req.app?.get?.('io');
      if (io) io.to(`u:${user.id}`).emit('contacts:connected', { email, ts: new Date().toISOString() });
    } catch {}

    if (decoded.platform === 'mobile') {
      return res.redirect(`${mobileScheme}://contacts?contacts=connected`);
    }
    return res.redirect(`${frontendUrl}/settings?contacts=connected`);
  } catch (err) {
    logger.error('Google Contacts callback error:', err.message);
    let isMobile = false;
    try {
      let s = req.query.state.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      isMobile = JSON.parse(Buffer.from(s, 'base64').toString('utf8')).platform === 'mobile';
    } catch {}
    if (isMobile) return res.redirect(`${mobileScheme}://contacts?contacts=error&msg=${encodeURIComponent(err.message)}`);
    return res.redirect(`${frontendUrl}/settings?contacts=error&msg=${encodeURIComponent(err.message)}`);
  }
}

// GET /api/contacts/connect
router.get('/connect', async (req, res) => {
  try {
    const platform = req.query.platform || 'web';
    const url = createContactsAuthUrl(req.user.id, REDIRECT_URI(), platform);
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/contacts/status
router.get('/status', async (req, res) => {
  try {
    const user = await userStore.getById(req.user.id);
    const cfg  = user?.preferences?.googleContacts || {};
    const connected = !cfg.disconnected && !!(cfg.tokens?.refresh_token || cfg.tokens?.access_token);
    res.json({ connected, email: cfg.email || null, connectedAt: cfg.connectedAt || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/contacts/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    await clearContactsTokens(req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/contacts?query=&pageToken=&pageSize=
router.get('/', async (req, res) => {
  try {
    const user  = await userStore.getById(req.user.id);
    const { query = '', pageToken, pageSize = '50' } = req.query;
    const result = await listContacts(user, {
      query,
      pageToken: pageToken || null,
      pageSize:  Math.min(parseInt(pageSize) || 50, 100),
    });
    res.json(result);
  } catch (err) {
    if (err.message === 'contacts_not_connected')
      return res.status(409).json({ error: 'contacts_not_connected' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:resourceName — get single contact detail
router.get('/:resourceName(*)', async (req, res) => {
  try {
    const user    = await userStore.getById(req.user.id);
    const contact = await getContact(user, decodeURIComponent(req.params.resourceName));
    res.json({ contact });
  } catch (err) {
    if (err.message === 'contacts_not_connected')
      return res.status(409).json({ error: 'contacts_not_connected' });
    res.status(500).json({ error: err.message });
  }
});

export default router;
