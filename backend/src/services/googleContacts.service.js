import { google } from 'googleapis';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function makeOAuth2(redirectUri) {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
}

export function createContactsAuthUrl(userId, redirectUri, platform = 'web') {
  const oauth2 = makeOAuth2(redirectUri);
  const state  = Buffer.from(JSON.stringify({ userId, platform })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return oauth2.generateAuthUrl({
    access_type:  'offline',
    prompt:       'consent',
    scope: [
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  });
}

export async function exchangeContactsCode(code, redirectUri) {
  const oauth2 = makeOAuth2(redirectUri);
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export async function saveContactsTokens(userId, tokens, email) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = user?.preferences || {};
  prefs.googleContacts = {
    tokens,
    email,
    connectedAt: new Date().toISOString(),
    disconnected: false,
  };
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } });
}

export async function clearContactsTokens(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = user?.preferences || {};
  prefs.googleContacts = { disconnected: true, tokens: null, email: null };
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } });
}

async function getContactsAuthClient(user) {
  const cfg = user?.preferences?.googleContacts;
  if (!cfg?.tokens || cfg.disconnected) return null;
  const oauth2 = makeOAuth2('');
  oauth2.setCredentials(cfg.tokens);
  // Auto-refresh if expired
  oauth2.on('tokens', async (newTokens) => {
    try {
      const fresh = { ...cfg.tokens, ...newTokens };
      await saveContactsTokens(user.id, fresh, cfg.email);
    } catch {}
  });
  return oauth2;
}

export async function listContacts(user, { query = '', pageToken = null, pageSize = 50 } = {}) {
  const auth = await getContactsAuthClient(user);
  if (!auth) throw new Error('contacts_not_connected');

  const people = google.people({ version: 'v1', auth });

  if (query) {
    // Search contacts
    const res = await people.people.searchContacts({
      query,
      readMask: 'names,emailAddresses,phoneNumbers,photos,organizations,birthdays',
      pageSize: Math.min(pageSize, 30),
    });
    return {
      contacts: normaliseContacts(res.data.results?.map(r => r.person) || []),
      nextPageToken: null,
      total: res.data.results?.length || 0,
    };
  }

  // List all contacts
  const params = {
    resourceName: 'people/me',
    pageSize,
    personFields: 'names,emailAddresses,phoneNumbers,photos,organizations,birthdays',
    sortOrder: 'LAST_MODIFIED_DESCENDING',
  };
  if (pageToken) params.pageToken = pageToken;

  const res = await people.people.connections.list(params);
  return {
    contacts:      normaliseContacts(res.data.connections || []),
    nextPageToken: res.data.nextPageToken || null,
    total:         res.data.totalPeople   || 0,
  };
}

export async function getContact(user, resourceName) {
  const auth = await getContactsAuthClient(user);
  if (!auth) throw new Error('contacts_not_connected');
  const people = google.people({ version: 'v1', auth });
  const res = await people.people.get({
    resourceName,
    personFields: 'names,emailAddresses,phoneNumbers,photos,organizations,birthdays,addresses,urls,biographies',
  });
  return normaliseContact(res.data);
}

function normaliseContacts(list) {
  return list.map(normaliseContact).filter(Boolean);
}

function normaliseContact(p) {
  if (!p) return null;
  const name   = p.names?.[0];
  const email  = p.emailAddresses?.[0];
  const phone  = p.phoneNumbers?.[0];
  const photo  = p.photos?.[0];
  const org    = p.organizations?.[0];
  const bday   = p.birthdays?.[0];
  const addr   = p.addresses?.[0];
  const bio    = p.biographies?.[0];

  const displayName = name?.displayName || email?.value || 'Unknown';
  const initials    = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return {
    id:           p.resourceName,
    displayName,
    firstName:    name?.givenName  || '',
    lastName:     name?.familyName || '',
    initials,
    email:        email?.value || null,
    phone:        phone?.value || null,
    photoUrl:     photo?.url   || null,
    organization: org?.name    || null,
    jobTitle:     org?.title   || null,
    birthday:     bday?.date   ? `${bday.date.year || ''}/${String(bday.date.month).padStart(2,'0')}/${String(bday.date.day).padStart(2,'0')}` : null,
    address:      addr?.formattedValue || null,
    bio:          bio?.value   || null,
    allEmails:    (p.emailAddresses || []).map(e => e.value),
    allPhones:    (p.phoneNumbers   || []).map(n => n.value),
  };
}
