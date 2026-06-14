import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { WebSocketServer } from 'ws';
import { fetch as undiciFetch } from 'undici';
import { LEAGUES } from './src/shared/constants.ts';
import fs from 'fs';
import crypto from 'crypto';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, terminate, disableNetwork, getDoc } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

app.use(express.json());

// Persistent User Database Config
const USERS_FILE = path.join(process.cwd(), 'users.json');
const DEFAULT_ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || process.env.VITE_APP_PASSWORD || 'admin123').trim();

// Try to initialize Firebase if the provisioning file exists
let firestoreDb: any = null;
const FIRESTORE_QUOTA_FILE = path.join(process.cwd(), '.firestore_quota_exceeded');
let firestoreDisabled = false;

try {
  if (fs.existsSync(FIRESTORE_QUOTA_FILE)) {
    const stats = fs.statSync(FIRESTORE_QUOTA_FILE);
    const now = Date.now();
    const fileAgeMs = now - stats.mtimeMs;
    // Reset file if it is older than 12 hours
    if (fileAgeMs > 12 * 60 * 60 * 1000) {
      try {
        fs.unlinkSync(FIRESTORE_QUOTA_FILE);
        console.log('[Firebase] Quota block file expired. Retrying connection check.');
      } catch (e) {}
    } else {
      firestoreDisabled = true;
      console.warn(`[Firebase] Bypassing initialization. Active Firebase Quota depletion block detected (created ${Math.round(fileAgeMs / 60000)}m ago).`);
    }
  }
} catch (e) {}

function flagFirestoreQuotaExceeded() {
  if (!firestoreDisabled) {
    firestoreDisabled = true;
    console.warn('[Firebase] Quota limit exceeded. Disabling further Firestore connections and using local fallback files.');
    try {
      fs.writeFileSync(FIRESTORE_QUOTA_FILE, 'true', 'utf-8');
    } catch (e) {
      console.error('[Firebase] Failed to write quota file:', e);
    }

    if (firestoreDb) {
      const dbToTerminate = firestoreDb;
      firestoreDb = null;
      Promise.resolve().then(async () => {
        try {
          console.log('[Firebase] Attempting to disable network and terminate Firestore client to quiet active retry loops...');
          await disableNetwork(dbToTerminate);
          await terminate(dbToTerminate);
          console.log('[Firebase] Firestore client successfully terminated.');
        } catch (e: any) {
          console.error('[Firebase] Error during Firestore client termination:', e.message || e);
        }
      });
    }
  }
}

try {
  const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigPath) && !firestoreDisabled) {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
    const firebaseApp = initializeApp(config);
    firestoreDb = getFirestore(firebaseApp, config.firestoreDatabaseId);
    console.log('[Firebase] Successfully initialized persistently connected Firestore database for accounts!');
  } else if (!fs.existsSync(firebaseConfigPath)) {
    console.warn('[Firebase] Warning: firebase-applet-config.json not found. Operating in local mode.');
  } else {
    console.warn('[Firebase] Warning: firebase-applet-config.json exists, but Firestore is disabled due to quota limits.');
  }
} catch (err: any) {
  console.error('[Firebase] Failed to initialize Firebase:', err.message);
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password.trim()).digest('hex');
}

interface AuthUser {
  username: string;
  passwordHash: string;
  fullName: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  totalUsageSeconds?: number;
  lastActiveAt?: string;
  updatedAt?: string;
}

// In-memory sessions store
const activeSessions = new Map<string, { username: string; role: 'admin' | 'user'; fullName: string }>();
const sessionLastActive = new Map<string, number>();

const SESSIONS_FILE = path.join(process.cwd(), 'sessions.json');

function saveSessions() {
  try {
    const list = [];
    for (const [token, sVal] of activeSessions.entries()) {
      const lastActive = sessionLastActive.get(token) || Date.now();
      list.push({
        token,
        username: sVal.username,
        role: sVal.role,
        fullName: sVal.fullName,
        lastActive
      });
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Auth] Error saving sessions:', err);
  }
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        const now = Date.now();
        for (const item of data) {
          const rawActive = item.lastActive;
          const activeTime = typeof rawActive === 'number' ? rawActive : (typeof rawActive === 'string' ? parseInt(rawActive, 10) : NaN);
          
          if (!isNaN(activeTime)) {
            // If the session is within 12 hours of inactivity, load it
            if (now - activeTime < 12 * 60 * 60 * 1000) {
              activeSessions.set(item.token, {
                username: item.username,
                role: item.role as 'admin' | 'user',
                fullName: item.fullName
              });
              sessionLastActive.set(item.token, activeTime);
            }
          }
        }
        console.log(`[Auth] Loaded ${activeSessions.size} active sessions from disk.`);
      }
    }
  } catch (err) {
    console.error('[Auth] Error loading sessions:', err);
  }
}

// Load sessions on startup
loadSessions();

async function resolveSession(token: string): Promise<{ username: string; role: 'admin' | 'user'; fullName: string } | null> {
  let session = activeSessions.get(token);
  if (session) {
    return session;
  }

  // Check Firestore if not found locally
  if (firestoreDb && !firestoreDisabled) {
    try {
      const docRef = doc(firestoreDb, 'sessions', token);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const now = Date.now();
        const lastActive = data.lastActive || now;
        
        // Ensure session is within 12 hours of inactivity
        if (now - lastActive < 12 * 60 * 60 * 1000) {
          const restoredSession = {
            username: data.username,
            role: data.role as 'admin' | 'user',
            fullName: data.fullName
          };
          activeSessions.set(token, restoredSession);
          sessionLastActive.set(token, lastActive);
          saveSessions(); // sync with local SESSIONS_FILE
          console.log(`[Firebase] Session restored from Firestore for user: ${data.username}`);
          return restoredSession;
        } else {
          // Clean up expired session from Firestore
          try {
            await deleteDoc(docRef);
          } catch (e) {}
        }
      }
    } catch (err: any) {
      console.error('[Firebase] Failed to resolve session from Firestore:', err.message);
    }
  }

  return null;
}

// Clean up expired sessions periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const token of activeSessions.keys()) {
    const lastActive = sessionLastActive.get(token);
    if (lastActive && (now - lastActive > 12 * 60 * 60 * 1000)) { // 12 hours
      activeSessions.delete(token);
      sessionLastActive.delete(token);
      changed = true;
    }
  }
  if (changed) {
    saveSessions();
  }
}, 300000);

let cachedUsers: AuthUser[] | null = null;
let lastUsersFetchTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds cache for reads

async function getUsers(): Promise<AuthUser[]> {
  const now = Date.now();
  if (cachedUsers && (now - lastUsersFetchTime < CACHE_TTL_MS)) {
    return cachedUsers.map(u => ({ ...u }));
  }

  // Load from local file first
  let localUsers: AuthUser[] = [];
  try {
    if (fs.existsSync(USERS_FILE)) {
      localUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[Auth] Error reading local users file:', err);
  }

  // Load from Firestore if available
  let fsUsers: AuthUser[] = [];
  if (firestoreDb && !firestoreDisabled) {
    try {
      const colRef = collection(firestoreDb, 'users');
      const snap = await getDocs(colRef);
      snap.forEach(docSnap => {
        fsUsers.push(docSnap.data() as AuthUser);
      });
    } catch (err: any) {
      console.error('[Firebase] Error reading users from Firestore:', err.message || err);
      const errMsg = String(err.message || err || '').toLowerCase();
      if (errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('resource-exhausted') || err.code === 'resource-exhausted') {
        flagFirestoreQuotaExceeded();
      }
    }
  }

  // Merge the lists prioritizing the latest update
  const mergedMap = new Map<string, AuthUser>();

  // Add all local users first
  localUsers.forEach(u => mergedMap.set(u.username.toLowerCase(), { ...u }));

  // Overlay Firestore users, choosing the latest by updatedAt/lastActiveAt/createdAt
  fsUsers.forEach(fsU => {
    const key = fsU.username.toLowerCase();
    const localU = mergedMap.get(key);
    if (!localU) {
      mergedMap.set(key, { ...fsU });
    } else {
      const localTime = Date.parse(localU.updatedAt || localU.lastActiveAt || localU.createdAt || '1970-01-01T00:00:00Z');
      const fsTime = Date.parse(fsU.updatedAt || fsU.lastActiveAt || fsU.createdAt || '1970-01-01T00:00:00Z');
      
      if (fsTime > localTime) {
        mergedMap.set(key, { ...fsU });
      }
    }
  });

  const mergedList = Array.from(mergedMap.values());

  // Save the merged list back locally if there were differences
  if (JSON.stringify(localUsers) !== JSON.stringify(mergedList)) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(mergedList, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Auth] Error fixing up local users file during merge:', err);
    }
  }

  cachedUsers = mergedList.map(u => ({ ...u }));
  lastUsersFetchTime = now;
  return mergedList.map(u => ({ ...u }));
}

async function saveUsers(users: AuthUser[]) {
  const nowStr = new Date().toISOString();
  
  // Track changes to update updatedAt automatically
  const oldUsersMap = new Map<string, AuthUser>();
  if (cachedUsers) {
    cachedUsers.forEach(u => oldUsersMap.set(u.username.toLowerCase(), u));
  } else {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const local: AuthUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        local.forEach(u => oldUsersMap.set(u.username.toLowerCase(), u));
      }
    } catch (e) {}
  }

  users.forEach(u => {
    const oldU = oldUsersMap.get(u.username.toLowerCase());
    if (!oldU) {
      if (!u.updatedAt) u.updatedAt = nowStr;
    } else {
      if (oldU.updatedAt && !u.updatedAt) {
        u.updatedAt = oldU.updatedAt;
      }
      
      const hasChanged = 
        oldU.passwordHash !== u.passwordHash ||
        oldU.fullName !== u.fullName ||
        oldU.role !== u.role ||
        oldU.status !== u.status ||
        oldU.totalUsageSeconds !== u.totalUsageSeconds ||
        oldU.lastActiveAt !== u.lastActiveAt;
      
      if (hasChanged) {
        u.updatedAt = nowStr;
      }
    }
  });

  // Dual-write locally for safety and redundancy first
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Auth] Error saving local users file:', err);
  }

  // Sync to persistently connected Firestore if available
  if (firestoreDb && !firestoreDisabled) {
    try {
      // Find which users actually changed or are new
      const changedUsers = users.filter(u => {
        const oldU = oldUsersMap.get(u.username.toLowerCase());
        if (!oldU) return true; // New user
        return (
          oldU.passwordHash !== u.passwordHash ||
          oldU.fullName !== u.fullName ||
          oldU.role !== u.role ||
          oldU.status !== u.status ||
          oldU.totalUsageSeconds !== u.totalUsageSeconds ||
          oldU.lastActiveAt !== u.lastActiveAt ||
          oldU.updatedAt !== u.updatedAt
        );
      });

      if (changedUsers.length > 0) {
        const pWrites = changedUsers.map(u => {
          const docRef = doc(firestoreDb, 'users', u.username.toLowerCase());
          return setDoc(docRef, u);
        });
        await Promise.all(pWrites);
        console.log(`[Firebase] Sync: Updated ${changedUsers.length} user documents in Firestore.`);
      }

      // Deletions check (only run if users list shrank compared to our memory cache)
      const localUsernames = new Set(users.map(u => u.username.toLowerCase()));
      const weHadDeletions = cachedUsers && (users.length < cachedUsers.length);
      if (weHadDeletions) {
        const colRef = collection(firestoreDb, 'users');
        const snap = await getDocs(colRef);
        const pDeletes: Promise<void>[] = [];
        snap.forEach(docSnap => {
          const id = docSnap.id;
          if (!localUsernames.has(id)) {
            pDeletes.push(deleteDoc(doc(firestoreDb, 'users', id)));
          }
        });
        if (pDeletes.length > 0) {
          await Promise.all(pDeletes);
          console.log(`[Firebase] Sync: Deleted ${pDeletes.length} obsolete user documents in Firestore.`);
        }
      }
    } catch (err: any) {
      console.error('[Firebase] Error synchronizing auth changes to Firestore:', err.message || err);
      const errMsg = String(err.message || err || '').toLowerCase();
      if (errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('resource-exhausted') || err.code === 'resource-exhausted') {
        flagFirestoreQuotaExceeded();
      }
    }
  }

  // Update in-memory cache directly with deep copies
  cachedUsers = users.map(u => ({ ...u }));
  lastUsersFetchTime = Date.now();
}

// Persistent Admin Messages System
const MESSAGES_FILE = path.join(process.cwd(), 'messages.json');

interface UserMessage {
  id: string;
  from: string;
  to: string; // username or 'all'
  content: string;
  readBy: string[]; // usernames of people who have read it
  read: boolean;
  createdAt: string;
  updatedAt?: string;
}

let cachedMessages: UserMessage[] | null = null;
let lastMessagesFetchTime = 0;
const MSG_CACHE_TTL_MS = 10000; // 10 seconds cache for reads

async function getMessages(): Promise<UserMessage[]> {
  const now = Date.now();
  if (cachedMessages && (now - lastMessagesFetchTime < MSG_CACHE_TTL_MS)) {
    return cachedMessages.map(m => ({ ...m, readBy: [...(m.readBy || [])] }));
  }

  // Load local messages first
  let localMessages: UserMessage[] = [];
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      localMessages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[Auth] Error reading local messages file:', err);
  }

  // Load from Firestore if available
  let fsMessages: UserMessage[] = [];
  if (firestoreDb && !firestoreDisabled) {
    try {
      const colRef = collection(firestoreDb, 'messages');
      const snap = await getDocs(colRef);
      snap.forEach(docSnap => {
        fsMessages.push(docSnap.data() as UserMessage);
      });
    } catch (err: any) {
      console.error('[Firebase] Error reading messages from Firestore:', err.message || err);
      const errMsg = String(err.message || err || '').toLowerCase();
      if (errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('resource-exhausted') || err.code === 'resource-exhausted') {
        flagFirestoreQuotaExceeded();
      }
    }
  }

  // Merge lists
  const mergedMap = new Map<string, UserMessage>();
  
  localMessages.forEach(m => mergedMap.set(m.id, { ...m, readBy: [...(m.readBy || [])] }));

  fsMessages.forEach(fsM => {
    const localM = mergedMap.get(fsM.id);
    if (!localM) {
      mergedMap.set(fsM.id, { ...fsM, readBy: [...(fsM.readBy || [])] });
    } else {
      // Compare updatedAt/createdAt
      const localTime = Date.parse(localM.updatedAt || localM.createdAt || '1970-01-01T00:00:00Z');
      const fsTime = Date.parse(fsM.updatedAt || fsM.createdAt || '1970-01-01T00:00:00Z');

      if (fsTime > localTime) {
        mergedMap.set(fsM.id, { ...fsM, readBy: [...(fsM.readBy || [])] });
      }
    }
  });

  const mergedList = Array.from(mergedMap.values());
  const sorted = mergedList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (JSON.stringify(localMessages) !== JSON.stringify(sorted)) {
    try {
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Auth] Error fixing up local messages file during merge:', err);
    }
  }

  cachedMessages = sorted.map(m => ({ ...m, readBy: [...(m.readBy || [])] }));
  lastMessagesFetchTime = now;
  return sorted.map(m => ({ ...m, readBy: [...(m.readBy || [])] }));
}

async function saveMessages(messages: UserMessage[]) {
  const nowStr = new Date().toISOString();
  
  // Track changes to update updatedAt
  const oldMsgsMap = new Map<string, UserMessage>();
  if (cachedMessages) {
    cachedMessages.forEach(m => oldMsgsMap.set(m.id, m));
  } else {
    try {
      if (fs.existsSync(MESSAGES_FILE)) {
        const local: UserMessage[] = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
        local.forEach(m => oldMsgsMap.set(m.id, m));
      }
    } catch (e) {}
  }

  messages.forEach(m => {
    const oldM = oldMsgsMap.get(m.id);
    if (!oldM) {
      if (!m.updatedAt) m.updatedAt = nowStr;
    } else {
      if (oldM.updatedAt && !m.updatedAt) {
        m.updatedAt = oldM.updatedAt;
      }
      const hasChanged = 
        oldM.content !== m.content ||
        oldM.read !== m.read ||
        oldM.readBy.length !== m.readBy.length ||
        JSON.stringify(oldM.readBy) !== JSON.stringify(m.readBy);
      
      if (hasChanged) {
        m.updatedAt = nowStr;
      }
    }
  });

  // Dual-write locally first
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Auth] Error saving local messages file:', err);
  }

  if (firestoreDb && !firestoreDisabled) {
    try {
      const changedMsgs = messages.filter(m => {
        const oldM = oldMsgsMap.get(m.id);
        if (!oldM) return true; // New message
        return (
          oldM.content !== m.content ||
          oldM.read !== m.read ||
          oldM.readBy.length !== m.readBy.length ||
          JSON.stringify(oldM.readBy) !== JSON.stringify(m.readBy) ||
          oldM.updatedAt !== m.updatedAt
        );
      });

      if (changedMsgs.length > 0) {
        const pWrites = changedMsgs.map(m => {
          const docRef = doc(firestoreDb, 'messages', m.id);
          return setDoc(docRef, m);
        });
        await Promise.all(pWrites);
        console.log(`[Firebase] Sync: Updated ${changedMsgs.length} message documents in Firestore.`);
      }

      const localIds = new Set(messages.map(m => m.id));
      const weHadDeletions = cachedMessages && (messages.length < cachedMessages.length);
      if (weHadDeletions) {
        const colRef = collection(firestoreDb, 'messages');
        const snap = await getDocs(colRef);
        const pDeletes: Promise<void>[] = [];
        snap.forEach(docSnap => {
          const id = docSnap.id;
          if (!localIds.has(id)) {
            pDeletes.push(deleteDoc(doc(firestoreDb, 'messages', id)));
          }
        });
        if (pDeletes.length > 0) {
          await Promise.all(pDeletes);
          console.log(`[Firebase] Sync: Deleted ${pDeletes.length} obsolete message documents in Firestore.`);
        }
      }
    } catch (err: any) {
      console.error('[Firebase] Error synchronizing message changes to Firestore:', err.message || err);
      const errMsg = String(err.message || err || '').toLowerCase();
      if (errMsg.includes('resource_exhausted') || errMsg.includes('quota') || errMsg.includes('resource-exhausted') || err.code === 'resource-exhausted') {
        flagFirestoreQuotaExceeded();
      }
    }
  }

  cachedMessages = messages.map(m => ({ ...m, readBy: [...(m.readBy || [])] }));
  lastMessagesFetchTime = Date.now();
}

async function initUsersFile() {
  try {
    let users = await getUsers();
    const expectedHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
    
    // Ensure admin user exists and is fully synced with DEFAULT_ADMIN_PASSWORD
    const adminIdx = users.findIndex(u => u.username === 'admin');
    if (adminIdx === -1) {
      users.push({
        username: 'admin',
        passwordHash: expectedHash,
        fullName: 'Administrateur',
        role: 'admin',
        status: 'approved',
        createdAt: new Date().toISOString()
      });
      console.log(`[Auth] User database initialized with default admin.`);
    } else {
      // Sync admin password in users.json to match active DEFAULT_ADMIN_PASSWORD configuration
      if (users[adminIdx].passwordHash !== expectedHash) {
        users[adminIdx].passwordHash = expectedHash;
        console.log(`[Auth] Admin password synchronized with active ADMIN_PASSWORD configuration.`);
      }
    }

    await saveUsers(users);
  } catch (err) {
    console.error('[Auth] Error initializing accounts:', err);
  }
}

// Initialize on startup
initUsersFile();

// REST endpoints for user authentication and management
app.post('/api/auth/register', async (req, res) => {
  const { username, password, fullName } = req.body;
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
  }

  const normalizedUsername = username.trim().toLowerCase();
  if (normalizedUsername.length < 3) {
    return res.status(400).json({ error: 'Le nom d’utilisateur doit faire au moins 3 caractères.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 4 caractères.' });
  }

  const users = await getUsers();
  if (users.some(u => u.username.toLowerCase() === normalizedUsername)) {
    return res.status(400).json({ error: 'Ce nom d’utilisateur est déjà utilisé.' });
  }

  const newUser: AuthUser = {
    username: username.trim(),
    passwordHash: hashPassword(password),
    fullName: fullName.trim(),
    role: 'user',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await saveUsers(users);

  res.json({ success: true, message: 'Compte créé avec succès. En attente de validation par l’administrateur.' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Veuillez saisir les identifiants.' });
  }

  const users = await getUsers();
  const normalizedUsername = username.trim().toLowerCase();
  const foundUser = users.find(u => u.username.toLowerCase() === normalizedUsername);

  if (!foundUser || foundUser.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Nom d’utilisateur ou mot de passe incorrect.' });
  }

  if (foundUser.status === 'pending') {
    return res.status(403).json({ 
      pending: true, 
      error: 'Votre compte est en attente de validation par l’administrateur.' 
    });
  }

  if (foundUser.status === 'rejected') {
    return res.status(403).json({ 
      error: 'Votre compte a été rejeté par l’administrateur.' 
    });
  }

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const sessionData = {
    username: foundUser.username,
    role: foundUser.role,
    fullName: foundUser.fullName
  };
  activeSessions.set(token, sessionData);
  sessionLastActive.set(token, Date.now());
  saveSessions();

  if (firestoreDb && !firestoreDisabled) {
    try {
      const docRef = doc(firestoreDb, 'sessions', token);
      await setDoc(docRef, {
        token,
        username: sessionData.username,
        role: sessionData.role,
        fullName: sessionData.fullName,
        lastActive: Date.now()
      });
    } catch (err: any) {
      console.error('[Firebase] Failed to write new session to Firestore:', err.message);
    }
  }

  res.json({
    success: true,
    token,
    user: sessionData
  });
});

app.post('/api/auth/verify-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });

  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée ou invalide.' });
  }

  // Update session active state when verifying token
  const now = Date.now();
  sessionLastActive.set(token, now);
  saveSessions();

  // Sync back to Firestore
  if (firestoreDb && !firestoreDisabled) {
    try {
      const docRef = doc(firestoreDb, 'sessions', token);
      await setDoc(docRef, {
        token,
        username: session.username,
        role: session.role,
        fullName: session.fullName,
        lastActive: now
      }, { merge: true });
    } catch (e: any) {
      console.error('[Firebase] Failed to update session in Firestore during verification:', e.message);
    }
  }

  // Double check if user is still approved and not deleted/rejected in users.json
  const users = await getUsers();
  const foundUser = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
  if (!foundUser || foundUser.status !== 'approved') {
    activeSessions.delete(token);
    sessionLastActive.delete(token);
    saveSessions();
    if (firestoreDb && !firestoreDisabled) {
      try {
        await deleteDoc(doc(firestoreDb, 'sessions', token));
      } catch (e) {}
    }
    return res.status(401).json({ error: 'Compte non autorisé ou expiré.' });
  }

  res.json({ success: true, user: session });
});

app.post('/api/auth/logout', async (req, res) => {
  const { token } = req.body;
  if (token) {
    activeSessions.delete(token);
    sessionLastActive.delete(token);
    saveSessions();
    if (firestoreDb && !firestoreDisabled) {
      try {
        await deleteDoc(doc(firestoreDb, 'sessions', token));
      } catch (e) {}
    }
  }
  res.json({ success: true });
});

app.post('/api/auth/heartbeat', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });

  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée' });
  }

  // Update session active state
  const now = Date.now();
  const lastActive = sessionLastActive.get(token) || now;
  const elapsedSeconds = Math.min(Math.round((now - lastActive) / 1000), 120);

  sessionLastActive.set(token, now);
  saveSessions();

  // Sync heartbeat timestamp to Firestore sessions
  if (firestoreDb && !firestoreDisabled) {
    try {
      const docRef = doc(firestoreDb, 'sessions', token);
      await setDoc(docRef, {
        lastActive: now
      }, { merge: true });
    } catch (e: any) {
      console.error('[Firebase] Failed to update session heartbeat in Firestore:', e.message);
    }
  }

  const username = session.username.toLowerCase();

  // Save/accumulate user usage time
  let users = await getUsers();
  const userIdx = users.findIndex(u => u.username.toLowerCase() === username);
  let updatedUsage = 0;
  if (userIdx !== -1) {
    const current = users[userIdx];
    current.totalUsageSeconds = (current.totalUsageSeconds || 0) + elapsedSeconds;
    current.lastActiveAt = new Date().toISOString();
    updatedUsage = current.totalUsageSeconds;
    await saveUsers(users);
  }

  res.json({ success: true, totalUsageSeconds: updatedUsage });
});

async function formatUsersListForAdmin(usersList: AuthUser[]): Promise<any[]> {
  const onlineUsernames = new Set<string>();
  const now = Date.now();

  // 1. Sync through Firestore across different node instances
  if (firestoreDb && !firestoreDisabled) {
    try {
      const colRef = collection(firestoreDb, 'sessions');
      const querySnap = await getDocs(colRef);
      querySnap.forEach((docSnap) => {
        const data = docSnap.data();
        const rawActive = data.lastActive;
        const lastActive = typeof rawActive === 'number' ? rawActive : now;
        // Considered online if the heartbeat was within 6 minutes
        if (now - lastActive < 360000) {
          onlineUsernames.add(data.username.toLowerCase());
        }
      });
    } catch (err: any) {
      console.error('[Firebase] Failed to load across-instance sessions from Firestore:', err.message);
    }
  }

  // 2. Also fallback to local memory in-memory map
  for (const [sToken, sVal] of activeSessions.entries()) {
    const rawActive = sessionLastActive.get(sToken);
    const lastActive = typeof rawActive === 'number' ? rawActive : (typeof rawActive === 'string' ? parseInt(rawActive, 10) : now);
    
    if (now - lastActive < 360005) { // Considered online if active in the last 360 seconds (6 minutes)
      onlineUsernames.add(sVal.username.toLowerCase());
    }
  }

  return usersList.map(u => {
    let isOnline = onlineUsernames.has(u.username.toLowerCase());
    
    // Fail-safe fallback: check lastActiveAt datestamp as a backup check
    if (!isOnline && u.lastActiveAt) {
      try {
        const lastActiveTime = new Date(u.lastActiveAt).getTime();
        // Considered online if the last datestamp is within 6 minutes (360 seconds)
        if (now - lastActiveTime < 360000) {
          isOnline = true;
        }
      } catch (e) {
        // Safe skip
      }
    }

    return {
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      totalUsageSeconds: u.totalUsageSeconds || 0,
      lastActiveAt: u.lastActiveAt || null,
      isOnline
    };
  });
}

// Admin management endpoints (Secured with token validation)
app.get('/api/auth/admin/users', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès administrateur requis.' });
  }

  const usersList = await getUsers();
  const users = await formatUsersListForAdmin(usersList);

  res.json({ success: true, users });
});

app.get('/api/auth/admin/export-backup', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès administrateur requis.' });
  }

  const users = await getUsers();
  res.setHeader('Content-disposition', 'attachment; filename=mahakasa_comptes_backup.json');
  res.setHeader('Content-type', 'application/json');
  res.write(JSON.stringify(users, null, 2));
  res.end();
});

app.post('/api/auth/admin/import-backup', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès administrateur requis.' });
  }

  const { backupUsers } = req.body;
  if (!backupUsers || !Array.isArray(backupUsers)) {
    return res.status(400).json({ error: 'Données de sauvegarde invalides.' });
  }

  let currentUsers = await getUsers();
  let importCount = 0;

  for (const bUser of backupUsers) {
    if (!bUser.username || !bUser.passwordHash) continue;
    
    // Safety check to keep the currently configured root admin active and secure
    if (bUser.username === 'admin') {
      continue;
    }

    const idx = currentUsers.findIndex(u => u.username.toLowerCase() === bUser.username.toLowerCase());
    if (idx === -1) {
      currentUsers.push({
        username: bUser.username,
        passwordHash: bUser.passwordHash,
        fullName: bUser.fullName || bUser.username,
        role: bUser.role || 'user',
        status: bUser.status || 'pending',
        createdAt: bUser.createdAt || new Date().toISOString()
      });
      importCount++;
    } else {
      currentUsers[idx].passwordHash = bUser.passwordHash;
      currentUsers[idx].fullName = bUser.fullName || currentUsers[idx].fullName;
      currentUsers[idx].role = bUser.role || currentUsers[idx].role;
      currentUsers[idx].status = bUser.status || currentUsers[idx].status;
      importCount++;
    }
  }

  await saveUsers(currentUsers);

  const projectedUsers = await formatUsersListForAdmin(currentUsers);

  res.json({ success: true, count: importCount, users: projectedUsers });
});

app.post('/api/auth/admin/update-status', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès administrateur requis.' });
  }

  const { targetUsername, status } = req.body;
  if (!targetUsername || !status) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }

  let users = await getUsers();
  const userIdx = users.findIndex(u => u.username.toLowerCase() === targetUsername.toLowerCase());

  if (userIdx === -1) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  if (users[userIdx].username === 'admin') {
    return res.status(400).json({ error: 'Impossible de modifier le compte de l’administrateur principal.' });
  }

  if (status === 'deleted') {
    // Delete user
    users = users.filter((_, i) => i !== userIdx);
    // Erase active sessions for deleted user
    let changed = false;
    for (const [sToken, sVal] of activeSessions.entries()) {
      if (sVal.username.toLowerCase() === targetUsername.toLowerCase()) {
        activeSessions.delete(sToken);
        sessionLastActive.delete(sToken);
        changed = true;
        if (firestoreDb && !firestoreDisabled) {
          deleteDoc(doc(firestoreDb, 'sessions', sToken)).catch(() => {});
        }
      }
    }
    if (changed) {
      saveSessions();
    }
  } else {
    // Approve or Reject status updates
    users[userIdx].status = status;
    if (status === 'rejected') {
      // Deauthorize current session if any
      let changed = false;
      for (const [sToken, sVal] of activeSessions.entries()) {
        if (sVal.username.toLowerCase() === targetUsername.toLowerCase()) {
          activeSessions.delete(sToken);
          sessionLastActive.delete(sToken);
          changed = true;
          if (firestoreDb && !firestoreDisabled) {
            deleteDoc(doc(firestoreDb, 'sessions', sToken)).catch(() => {});
          }
        }
      }
      if (changed) {
        saveSessions();
      }
    }
  }

  await saveUsers(users);
  
  const projectedUsers = await formatUsersListForAdmin(users);

  res.json({ success: true, users: projectedUsers });
});

// Persistent User Messaging Endpoints
app.get('/api/auth/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée' });
  }

  const messages = await getMessages();
  
  if (session.role === 'admin') {
    return res.json({ success: true, messages });
  } else {
    const filtered = messages.filter(
      m => m.to.toLowerCase() === session.username.toLowerCase() || m.to.toLowerCase() === 'all'
    );
    return res.json({ success: true, messages: filtered });
  }
});

app.post('/api/auth/admin/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès administrateur requis.' });
  }

  const { to, content } = req.body;
  if (!to || !content || !content.trim()) {
    return res.status(400).json({ error: 'Destinataire et contenu obligatoires.' });
  }

  const messages = await getMessages();
  const newMessage: UserMessage = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
    from: session.username,
    to: to,
    content: content.trim(),
    readBy: [],
    read: false,
    createdAt: new Date().toISOString()
  };

  messages.push(newMessage);
  await saveMessages(messages);

  res.json({ success: true, message: newMessage });
});

app.post('/api/auth/messages/mark-read', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expirée' });
  }

  const { messageIds } = req.body;
  if (!messageIds || !Array.isArray(messageIds)) {
    return res.status(400).json({ error: 'Liste d\'identifiants invalide.' });
  }

  const messages = await getMessages();
  let changed = false;

  for (const m of messages) {
    if (messageIds.includes(m.id)) {
      if (m.to.toLowerCase() === 'all') {
        if (!m.readBy.includes(session.username.toLowerCase())) {
          m.readBy.push(session.username.toLowerCase());
          changed = true;
        }
      } else if (m.to.toLowerCase() === session.username.toLowerCase()) {
        if (!m.read) {
          m.read = true;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    await saveMessages(messages);
  }

  res.json({ success: true });
});

app.delete('/api/auth/admin/messages/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const token = authHeader.split(' ')[1];
  const session = await resolveSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès administrateur requis.' });
  }

  const { id } = req.params;
  let messages = await getMessages();
  const initialLength = messages.length;
  messages = messages.filter(m => m.id !== id);

  if (messages.length !== initialLength) {
    await saveMessages(messages);
    return res.json({ success: true });
  } else {
    return res.status(404).json({ error: 'Message non trouvé.' });
  }
});

// Logs storage for the scraper
const serverLogs: any[] = [];
const addServerLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    type
  };
  serverLogs.unshift(logEntry);
  if (serverLogs.length > 100) serverLogs.pop();
  console.log(`[${type.toUpperCase()}] ${message}`);
};

const fetchWithRetry = async (url: string, type: string, leagueId?: string, retries = 2, delay = 1000): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await undiciFetch(url, {
      signal: controller.signal as any,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://bet261.mg',
        'Referer': 'https://bet261.mg/',
        'X-HH-Language': 'fr-FR',
        'X-HH-Platform': 'web'
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const respText = await response.text().catch(() => 'No body');
      console.log(`[Proxy] Response status ${response.status} from ${url} | Info: ${respText.substring(0, 50)}`);

      if (response.status >= 500 && retries > 0) {
        console.log(`[Proxy] Refreshing request ${url} (${retries} left)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, type, leagueId, retries - 1, delay * 2);
      }

      if (response.status === 400 || response.status === 404 || response.status === 503) {
        if (type === 'ranking') {
          // If path format failed, try query format
          if (leagueId && url.includes(`/instantleagues/${leagueId}/ranking`)) {
            const fallbackUrl = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/ranking?eventCategoryId=${leagueId}`;
            return fetchWithRetry(fallbackUrl, type, leagueId, 0);
          }
          // Fallback case result
          return { teams: [] };
        }
        if (type === 'matches') return { data: { rounds: [], seasonId: 0 } };
        if (type === 'results') return { data: { rounds: [] } };
        if (type === 'round') return { data: { round: { matches: [] } } };
        if (type === 'playout') return { data: { matches: [] } };
      }
      throw new Error(`Sporty API status ${response.status}`);
    }
    return response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (retries > 0) {
      console.log(`[Proxy] Connection timeout or issue, retrying ${url} (${retries} left)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, type, leagueId, retries - 1, delay * 2);
    }
    throw err;
  }
};

// Sporty API proxy
app.get('/api/data/league/:type/:leagueId', async (req, res) => {
  const { type, leagueId } = req.params;
  const { skip = '0', take = '100' } = req.query;

  // Protect against NaN or undefined leagueId
  if (!leagueId || leagueId === 'NaN' || leagueId === 'undefined' || isNaN(Number(leagueId))) {
    console.warn(`[Proxy] Blocked invalid leagueId: "${leagueId}" for type "${type}"`);
    if (type === 'ranking') return res.json({ teams: [] });
    if (type === 'matches') return res.json({ rounds: [], seasonId: 0 });
    if (type === 'results') return res.json({ rounds: [] });
    return res.status(400).json({ error: 'Identifiant de ligue invalide.' });
  }

  // Protect against NaN skip or take
  let cleanSkip = String(skip);
  let cleanTake = String(take);
  if (cleanSkip === 'NaN' || isNaN(Number(cleanSkip))) cleanSkip = '0';
  if (cleanTake === 'NaN' || isNaN(Number(cleanTake))) cleanTake = '100';
  
  const urls: Record<string, string> = {
    ranking: `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${leagueId}/ranking`,
    matches: `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${leagueId}/matches`,
    results: `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${leagueId}/results?skip=${cleanSkip}&take=${cleanTake}`
  };

  if (!urls[type]) return res.status(404).json({ error: 'Endpoint not found' });

  try {
    const data = await fetchWithRetry(urls[type], type, leagueId);
    res.json(data.data || data);
  } catch (err: any) {
    console.log(`[Proxy] Connection unresolved for ${type}:`, err.message);
    if (type === 'ranking') return res.json({ teams: [] });
    if (type === 'matches') return res.json({ rounds: [], seasonId: 0 });
    if (type === 'results') return res.json({ rounds: [] });
    res.status(502).json({ message: 'Upstream connection unavailable' });
  }
});

function cleanCookieHeader(rawCookies: string | string[]): string {
  if (!rawCookies) return '';
  const cookieParts: string[] = [];
  const rawStr = Array.isArray(rawCookies) ? rawCookies.join(', ') : rawCookies;
  
  // Directives we want to ignore
  const reserved = ['path', 'domain', 'expires', 'secure', 'httponly', 'samesite', 'max-age'];

  // Split on comma first to handle multiple Set-Cookie headers
  const declarations = rawStr.split(/,(?=\s*[a-zA-Z0-9_\-]+[=])/);
  for (const decl of declarations) {
    // Split each declaration on semicolon to look at its attribute-value pairs
    const pairs = decl.split(';');
    // The very first pair of a Set-Cookie header is ALWAYS the actual cookie key-value
    const firstPair = pairs[0].trim();
    if (firstPair.includes('=')) {
      const eqIdx = firstPair.indexOf('=');
      const key = firstPair.substring(0, eqIdx).trim();
      const lowerKey = key.toLowerCase();
      if (!reserved.includes(lowerKey)) {
        const val = firstPair.substring(eqIdx + 1).trim();
        cookieParts.push(`${key}=${val}`);
      }
    }
    
    // Also parse other pairs in case they are actually other valid cookies (e.g. if the input was already a clean "cookie1=val1; cookie2=val2" string)
    for (let i = 1; i < pairs.length; i++) {
      const pair = pairs[i].trim();
      if (pair.includes('=')) {
        const eqIdx = pair.indexOf('=');
        const key = pair.substring(0, eqIdx).trim();
        const lowerKey = key.toLowerCase();
        if (!reserved.includes(lowerKey) && !cookieParts.some(c => c.startsWith(key + '='))) {
          const val = pair.substring(eqIdx + 1).trim();
          cookieParts.push(`${key}=${val}`);
        }
      }
    }
  }
  return cookieParts.join('; ');
}

// Bet261 Authentication & Customer Data
app.post('/api/bet261/login', async (req, res) => {
  let { username, password, preferredVariant } = req.body;
  
  // Normalize phone number: if starts with 0, replace with +261.
  if (username) {
    username = username.trim();
    if (username.startsWith('0')) {
      username = '+261' + username.substring(1);
    } else if (username.startsWith('261')) {
      username = '+' + username;
    } else if (/^[3][23489]/.test(username) && username.length === 9) {
      // Common Malagasy mobile prefixes: 32, 33, 34, 38, 39
      username = '+261' + username;
    }
  }

  console.log(`[Bet261] Login attempt for: ${username} (normalized)`);
  
  // Use a Madagascar IP from the user's logs
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  
  try {
    const makeLoginRequest = async (user: string, clientId: string = 'customer-browser', platformId: string = '1', operatorId: string = '1', useJson: boolean = false) => {
      let body;
      let contentType;

      if (useJson) {
        contentType = 'application/json; charset=utf-8';
        body = JSON.stringify({
          login: user,
          password: password,
          rememberMe: false,
          withRefresh: false
        });
      } else {
        contentType = 'application/x-www-form-urlencoded';
        const p = new URLSearchParams();
        p.append('grant_type', 'password');
        p.append('username', user);
        p.append('password', password);
        p.append('scope', 'Customer');
        p.append('client_id', clientId);
        body = p.toString();
      }

      return await undiciFetch('https://hg-customer-api-prod.sporty-tech.net/api/authentication/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': contentType,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/home/login',
          'User-Agent': customUserAgent,
          'OperatorID': operatorId,
          'PlatformID': platformId,
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web'
        },
        body
      });
    };

    // Try a sequence of likely valid combinations, prioritizing JSON as shown in user logs
    const rawNumber = username.replace(/\D/g, ''); // Digits only
    const nineDigits = rawNumber.endsWith(username.substring(username.length - 9)) ? username.substring(username.length - 9) : rawNumber.slice(-9);
    
    const usernameVariants = [
      username,                // e.g. +26138...
      username.replace('+', ''), // e.g. 26138...
      '0' + nineDigits,         // e.g. 038...
      nineDigits                // e.g. 38...
    ].filter((v, i, self) => self.indexOf(v) === i); // Unique only

    const attempts: any[] = [];

    // Prioritize the preferred working variant if supplied!
    if (preferredVariant && preferredVariant.u) {
      console.log(`[Bet261] Prioritizing preferred variant: User=${preferredVariant.u}, Op=${preferredVariant.o}, Plat=${preferredVariant.p}, Json=${preferredVariant.json}`);
      attempts.push({
        u: preferredVariant.u,
        c: preferredVariant.c || 'customer-browser',
        p: preferredVariant.p || '1',
        o: preferredVariant.o || '34',
        json: preferredVariant.json !== undefined ? preferredVariant.json : true
      });
    }

    const addAttempt = (att: any) => {
      const exists = attempts.some(a => a.u === att.u && a.c === att.c && a.p === att.p && a.o === att.o && a.json === att.json);
      if (!exists) {
        attempts.push(att);
      }
    };

    // Prioritize JSON Login with Operator 34 (Madagascar)
    for (const u of usernameVariants) {
      addAttempt({ u, c: 'customer-browser', p: '1', o: '34', json: true });
      addAttempt({ u, c: 'customer-browser', p: '1', o: '1', json: true });
    }
    // Fallback to Form Login if JSON fails
    for (const u of usernameVariants) {
      for (const o of ['34', '1']) {
        for (const p of ['1', '4']) {
          addAttempt({ u, c: 'customer-browser', p, o, json: false });
        }
      }
    }
    // Add PWA specific attempts
    addAttempt({ u: username, c: 'pwa', p: '1', o: '34', json: true });
    addAttempt({ u: username.replace('+', ''), c: 'pwa', p: '1', o: '1', json: true });

    let lastResponse = null;
    let lastErrText = '';

    for (const attempt of attempts) {
      console.log(`[Bet261] Trying ${attempt.json ? 'JSON' : 'FORM'} login: User=${attempt.u}, Op=${attempt.o}, Plat=${attempt.p}`);
      const response = await makeLoginRequest(attempt.u, attempt.c, attempt.p, attempt.o, attempt.json);
      
      const responseText = await response.text();
      lastResponse = response;
      lastErrText = responseText;

      if (response.ok) {
        try {
          const rawData = JSON.parse(responseText);
          
          // 1. High-reliability extraction of token from any nested variation
          const extractedToken = rawData.access_token || rawData.token || rawData.accessToken || 
                                 rawData.data?.access_token || rawData.data?.token || rawData.data?.accessToken;
          
          // 2. High-reliability extraction of primary customer profile payload
          const data = rawData.data ? { ...rawData.data } : { ...rawData };
          
           // 3. Inject operator and normalized token safely
          data.operatorId = attempt.o || rawData.operatorId || rawData.data?.operatorId || '34';
          data.access_token = extractedToken;
          data.workingVariant = {
            u: attempt.u,
            c: attempt.c,
            p: attempt.p,
            o: attempt.o,
            json: attempt.json
          };

          // 4. Capture any set-cookie headers from the Sporty API!
          const setCookieHeaders = response.headers.get('set-cookie');
          if (setCookieHeaders) {
            data.saved_cookies = setCookieHeaders;
            console.log(`[cookies] Captured set-cookie header: ${setCookieHeaders.substring(0, 50)}...`);
          } else if (typeof (response.headers as any).getSetCookie === 'function') {
            const cookiesArr = (response.headers as any).getSetCookie();
            if (cookiesArr && cookiesArr.length > 0) {
              data.saved_cookies = cookiesArr.join('; ');
              console.log(`[cookies] Captured getSetCookie: ${data.saved_cookies.substring(0, 50)}...`);
            }
          }

          console.log(`[Bet261] Login SUCCESS! User=${attempt.u}, Op=${data.operatorId}, Format=${attempt.json ? 'JSON' : 'FORM'}`);
          
          // Log a safe partial token for debugging
          const safeToken = data.access_token ? `${data.access_token.substring(0, 5)}...` : 'undefined';
          console.log(`[Bet261] Token received: ${safeToken}`);
          
          return res.json(data);
        } catch (e: any) {
          console.error(`[Bet261] Login success but body parse failed: ${e.message}`, responseText);
        }
      } else {
        try {
          const errJson = JSON.parse(responseText);
          console.log(`[Bet261] Attempt failed (Code ${errJson.code}): ${errJson.message}`);
        } catch (e) {
          console.log(`[Bet261] Attempt failed (${response.status}): ${responseText.substring(0, 100)}`);
        }
      }
    }

    console.error(`[Bet261] All login attempts failed.`);
    return res.status(lastResponse?.status || 401).json({ error: 'Login failed', details: lastErrText });
  } catch (err: any) {
    console.error(`[Bet261] Login exception: ${err.message}`);
    res.status(500).json({ error: 'Internal server error during login', details: err.message });
  }
});

app.get('/api/bet261/customer-info', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || token.includes('undefined') || token.includes('null') || token.trim() === 'Bearer') {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  try {
    const fetchInfo = async (op: string) => {
      // Sporty APIs can be picky about Bearer prefix and PlatformID.
      const sendReq = async (useBearer: boolean, platformId: string, endpoint: string) => {
        let cleanToken = token;
        while (cleanToken.toLowerCase().startsWith('bearer ')) {
          cleanToken = cleanToken.substring(7).trim();
        }
        const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

        const headers: any = {
          'Authorization': authHeader,
          'OperatorID': op,
          'PlatformID': platformId,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web',
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'User-Agent': customUserAgent
        };

        if (customCookie) {
          headers['Cookie'] = cleanCookieHeader(customCookie);
        }

        return await undiciFetch(endpoint, { headers });
      };

      const tryAllCombos = async (endpoint: string) => {
        const platforms = ['1', '4'];
        const bearers = [true, false];
        let lastResp = null;
        for (const p of platforms) {
          for (const b of bearers) {
            const r = await sendReq(b, p, endpoint);
            if (r.ok) return r;
            lastResp = r;
            if (r.status === 403) {
              console.warn(`[Bet261] 403 forbidden for Op ${op} Plat ${p} Bearer ${b}`);
            }
          }
        }
        return lastResp;
      };

      // Try main endpoint
      let res = await tryAllCombos('https://hg-customer-api-prod.sporty-tech.net/api/authentication/me?onLogin=true');
      if (res && res.ok) return res;

      // If unauthorized (401 or 403), fail early to avoid log spam and redundant fallback calls
      if (res && (res.status === 401 || res.status === 403)) {
        return res;
      }

      // Try reporting/balance as fallback (when not 401/403, e.g. other API failures)
      console.log(`[Bet261] Info failed or returned no response for Op ${op}, trying balance fallback...`);
      res = await tryAllCombos('https://hg-customer-api-prod.sporty-tech.net/api/reporting/balance');
      if (res && res.ok) return res;

      // Final fallback to generic account info
      return await sendReq(true, '1', 'https://hg-customer-api-prod.sporty-tech.net/api/authentication/me?onLogin=true');
    };

    let response = await fetchInfo(operatorId);

    // If 401 or 403, try the other common OperatorID
    if (response && (response.status === 401 || response.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      console.log(`[Bet261] Attempting info retry with Op ${altOp}...`);
      const retryResponse = await fetchInfo(altOp);
      if (retryResponse && retryResponse.ok) {
        response = retryResponse;
      }
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 401;
      const errText = response ? await response.text() : 'No response';
      if (status === 401 || status === 403) {
        console.log(`[Bet261] Info endpoint returned unauthenticated status ${status}`);
      } else {
        console.warn(`[Bet261] Info endpoint request returned non-success code: ${status} | ${errText.substring(0, 100)}`);
      }
      return res.status(status).json({ error: 'Failed to fetch account info', details: errText });
    }

    const rawData: any = await response.json();
    const data = rawData.data || rawData;

    // Capture any set-cookie headers from the Sporty API during info fetch
    const setCookieHeaders = response.headers.get('set-cookie');
    if (setCookieHeaders) {
      data.saved_cookies = setCookieHeaders;
      console.log(`[cookies] Captured set-cookie header on info: ${setCookieHeaders.substring(0, 50)}...`);
    } else if (typeof (response.headers as any).getSetCookie === 'function') {
      const cookiesArr = (response.headers as any).getSetCookie();
      if (cookiesArr && cookiesArr.length > 0) {
        data.saved_cookies = cookiesArr.join('; ');
        console.log(`[cookies] Captured getSetCookie on info: ${data.saved_cookies.substring(0, 50)}...`);
      }
    }

    // Normalize balance: authentication/me returns balance at root
    if (data.balance === undefined && data.availableBalance !== undefined) {
      data.balance = data.availableBalance;
    }

    console.log(`[Bet261] Account info fetched. Balance: ${data.balance}`);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error fetching account info', details: err.message });
  }
});

async function resolveDynamicIDs(eventId: string | number, selectionName: string, suppliedLeagueId?: string | number) {
  const requestedLeagueId = Number(suppliedLeagueId || 8035);
  const otherLeagues = [8035, 8036, 8037, 8060, 8042, 8043, 8044, 8056, 8065].filter(id => id !== requestedLeagueId);
  const searchLeagues = [requestedLeagueId, ...otherLeagues];

  for (const lgId of searchLeagues) {
    try {
      const url = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/${lgId}/matches`;
      const response = await undiciFetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/'
        }
      });
      if (!response.ok) continue;

      const data: any = await response.json();
      const rounds = data.data?.rounds || data.rounds || [];

      for (const round of rounds) {
        const matches = round.matches || [];
        for (const match of matches) {
          if (String(match.id) === String(eventId)) {
            const markets = match.eventBetTypes || [];
            const market = markets.find((m: any) => m.betTypeId === 30083 || String(m.name).toUpperCase() === '1X2');
            if (market) {
              const items = market.eventBetTypeItems || [];
              const nameNorm = String(selectionName).trim().toUpperCase();

              let targetShortName = '1';
              if (nameNorm === 'X' || nameNorm === 'DRAW' || nameNorm === 'NUL') {
                targetShortName = 'X';
              } else if (nameNorm === '2' || nameNorm === 'AWAY') {
                targetShortName = '2';
              }

              const item = items.find((it: any) => String(it.shortName).trim().toUpperCase() === targetShortName);
              if (item) {
                console.log(`[Proxy] Resolved eventId ${eventId} (${selectionName}) to marketId ${market.id}, outcomeId ${item.id}, odds ${item.odds} in league ${lgId}`);
                return {
                  marketId: String(market.id),
                  outcomeId: String(item.id),
                  odds: String(item.odds)
                };
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Proxy] Failed to search league ${lgId}: ${e.message}`);
    }
  }
  return null;
}

app.get('/api/bet261/freebet', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || token.includes('undefined') || token.includes('null') || token.trim() === 'Bearer') {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  try {
    const fetchFreebets = async (op: string) => {
      const sendReq = async (useBearer: boolean, platformId: string) => {
        let cleanToken = token;
        while (cleanToken.toLowerCase().startsWith('bearer ')) {
          cleanToken = cleanToken.substring(7).trim();
        }
        const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

        const headers: any = {
          'Authorization': authHeader,
          'OperatorID': op,
          'PlatformID': platformId,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web',
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'User-Agent': customUserAgent
        };

        if (customCookie) {
          headers['Cookie'] = cleanCookieHeader(customCookie);
        }

        const url = 'https://hg-customer-api-prod.sporty-tech.net/api/freebet?forBetting=true';
        return await undiciFetch(url, { headers });
      };

      const tryAllCombos = async () => {
        const platforms = ['1', '4'];
        const bearers = [true, false];
        let lastResp = null;
        for (const p of platforms) {
          for (const b of bearers) {
            const r = await sendReq(b, p);
            if (r.ok) return r;
            lastResp = r;
          }
        }
        return lastResp;
      };

      return await tryAllCombos();
    };

    let response = await fetchFreebets(operatorId);

    if (response && (response.status === 401 || response.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      console.log(`[cookies] Retrying freebet fetch with Op ${altOp}...`);
      const retryResponse = await fetchFreebets(altOp);
      if (retryResponse && retryResponse.ok) {
        response = retryResponse;
      }
    }

    if (!response || !response.ok) {
      const status = response ? response.status : 401;
      const errText = response ? await response.text() : 'No response';
      if (status === 401 || status === 403) {
        console.log(`[Bet261] Freebet endpoint returned unauthenticated status ${status}`);
      } else {
        console.warn(`[Bet261] Freebet endpoint request returned non-success code: ${status} | ${errText.substring(0, 100)}`);
      }
      return res.status(status).json({ error: 'Failed to fetch freebets', details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error(`[Bet261] Freebet exception: ${err.message}`);
    res.status(500).json({ error: 'Internal server error fetching freebets', details: err.message });
  }
});

app.post('/api/bet261/place-bet', async (req, res) => {
  const token = req.headers.authorization;
  if (!token || token.includes('undefined') || token.includes('null') || token.trim() === 'Bearer') {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  try {
    const rawSelections = req.body.selections || (req.body.bets && req.body.bets[0] && req.body.bets[0].selections) || [];
    
    // Pre-resolve dynamic IDs and actual live odds for all selections to avoid querying the games endpoint multiple times inside loops
    const resolvedDataList: any[] = [];
    for (const sel of rawSelections) {
      const resolved = await resolveDynamicIDs(sel.eventId, sel.outcomeName || sel.outcomeId, sel.leagueId);
      if (resolved) {
        resolvedDataList.push({
          success: true,
          outcomeId: String(resolved.outcomeId),
          marketId: String(resolved.marketId),
          liveOdds: String(resolved.odds),
          userOdds: String(sel.odds || resolved.odds)
        });
      } else {
        let outcomeId = sel.outcomeId;
        if (!outcomeId && sel.outcomeName) {
          const name = String(sel.outcomeName).trim().toUpperCase();
          if (name === '1' || name === 'HOME') {
            outcomeId = '1';
          } else if (name === 'X' || name === 'DRAW' || name === 'NUL') {
            outcomeId = '2';
          } else if (name === '2' || name === 'AWAY') {
            outcomeId = '3';
          }
        }
        resolvedDataList.push({
          success: false,
          fallbackOutcomeId: String(outcomeId || '1'),
          userOdds: String(sel.odds || '1.0')
        });
      }
    }

    // Function to build selections format depending on requirements of the tried strategy
    const buildSelections = (useStringIDs: boolean, useLiveOdds: boolean) => {
      const selectionsList: any[] = [];
      for (let i = 0; i < rawSelections.length; i++) {
        const rawSel = rawSelections[i];
        const rData = resolvedDataList[i];

        let outcomeId = '1';
        let marketId = '1';
        let odds = 1.0;

        if (rData.success) {
          outcomeId = rData.outcomeId;
          marketId = rData.marketId;
          odds = useLiveOdds ? Number(rData.liveOdds) : Number(rData.userOdds);
        } else {
          outcomeId = rData.fallbackOutcomeId;
          marketId = '1';
          odds = Number(rawSel.odds || rData.userOdds || '1.0');
        }

        const parsedOutcomeId = !isNaN(Number(outcomeId)) ? Number(outcomeId) : outcomeId;
        const parsedMarketId = !isNaN(Number(marketId)) ? Number(marketId) : marketId;

        selectionsList.push({
          eventId: useStringIDs ? String(rawSel.eventId) : Number(rawSel.eventId),
          outcomeId: useStringIDs ? String(outcomeId) : parsedOutcomeId,
          odds: Number(odds),
          marketId: useStringIDs ? String(marketId) : parsedMarketId,
          marketName: '1X2'
        });
      }
      return selectionsList;
    };

    // Sequential list of configurations and strategies to try if placing a bet fails
    const strategies = [
      // 1. Strings with Live Odds (the most accurate matching SportyBet's direct active state)
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 1 },
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 3 },
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 2 },
      { useStringIDs: true, useLiveOdds: true, oddsChangeType: 0 },

      // 2. Numbers with Live Odds
      { useStringIDs: false, useLiveOdds: true, oddsChangeType: 1 },
      { useStringIDs: false, useLiveOdds: true, oddsChangeType: 3 },
      { useStringIDs: false, useLiveOdds: true, oddsChangeType: 2 },

      // 3. Strings with User/Frontend Odds
      { useStringIDs: true, useLiveOdds: false, oddsChangeType: 1 },
      { useStringIDs: true, useLiveOdds: false, oddsChangeType: 3 }
    ];

    const fetchBetting = async (op: string) => {
      const stake = req.body.stake || (req.body.bets && req.body.bets[0] && req.body.bets[0].stake) || 500;
      let lastStatus = 400;
      let lastBodyText = '';

      for (const strat of strategies) {
        const selections = buildSelections(strat.useStringIDs, strat.useLiveOdds);
        
        const finalBody: any = {
          source: req.body.source || 1,
          flexi: req.body.flexi || false,
          oddsChangeType: strat.oddsChangeType,
          betLines: [
            {
              stake: Number(stake),
              type: 1
            }
          ],
          bets: [
            {
              stake: Number(stake),
              type: 1,
              selections: selections
            }
          ],
          selections: selections
        };

        if (req.body.freebetId) {
          finalBody.freebetId = Number(req.body.freebetId) || req.body.freebetId;
          if (finalBody.bets && finalBody.bets[0]) {
            finalBody.bets[0].freebetId = Number(req.body.freebetId) || req.body.freebetId;
          }
        }

        const platforms = ['1', '4'];
        const bearers = [true, false]; // true sends Bearer prefix, false sends clean token string

        for (const platformId of platforms) {
          for (const useBearer of bearers) {
            let cleanToken = token;
            while (cleanToken.toLowerCase().startsWith('bearer ')) {
              cleanToken = cleanToken.substring(7).trim();
            }
            const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

             try {
              console.log(`[Proxy Trial] Op: ${op}, Strat: Strings=${strat.useStringIDs} LiveOdds=${strat.useLiveOdds} ChangeType=${strat.oddsChangeType}, Platform: ${platformId}, Bearer: ${useBearer}`);
              
              const h: any = {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'OperatorID': op,
                'PlatformID': platformId,
                'Origin': 'https://bet261.mg',
                'Referer': 'https://bet261.mg/',
                'X-HH-Language': 'fr-FR',
                'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web',
                'X-Forwarded-For': madaIP,
                'X-Real-IP': madaIP,
                'True-Client-IP': madaIP,
                'Client-IP': madaIP,
                'Forwarded': `for=${madaIP}`,
                'User-Agent': customUserAgent
              };

              if (customCookie) {
                h['Cookie'] = cleanCookieHeader(customCookie);
              }

              const response = await undiciFetch('https://hg-betting-api-prod.sporty-tech.net/api/betting', {
                method: 'POST',
                headers: h,
                body: JSON.stringify(finalBody)
              });

              const text = await response.text();
              console.log(`[Proxy Trial Response] Status: ${response.status} | Body: ${text.substring(0, 150)}`);

              if (response.ok) {
                return { ok: true, status: response.status, body: text };
              } else {
                lastStatus = response.status;
                lastBodyText = text;
              }
            } catch (err: any) {
              console.warn(`[Proxy Trial Exception] Err: ${err.message}`);
              lastBodyText = err.message;
            }
          }
        }
      }

      return { ok: false, status: lastStatus, body: lastBodyText };
    };

    let runResult = await fetchBetting(operatorId);

    if (!runResult.ok && (runResult.status === 401 || runResult.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      console.log(`[Proxy Retry] FAILED with operator ${operatorId}, trying operator ${altOp}...`);
      const retryResult = await fetchBetting(altOp);
      if (retryResult.ok) {
        runResult = retryResult;
      }
    }

    if (!runResult.ok) {
      console.warn(`[Bet261] Bet placement failed across all configuration trials. Status: ${runResult.status} | Body: ${runResult.body}`);
      return res.status(runResult.status).json({ error: 'Bet placement failed', details: runResult.body });
    }

    console.log(`[Bet261] Bet placement success: ${runResult.body.substring(0, 200)}`);
    const data = JSON.parse(runResult.body);
    res.json(data);
  } catch (err: any) {
    console.error(`[Bet261] Bet placement exception: ${err.message}`);
    res.status(500).json({ error: 'Internal server error placing bet', details: err.message });
  }
});

// History endpoint
app.get('/api/bet261/history', async (req, res) => {
  console.log('[Bet261] GET /api/bet261/history hit');
  const token = req.headers.authorization;
  if (!token || token.includes('undefined')) {
    return res.status(401).json({ error: 'Token missing or invalid' });
  }

  const operatorId = (req.headers['x-operator-id'] as string) || '34';
  const customCookie = req.headers['x-bet261-cookie'] as string;
  const madaIP = '102.18.161.27';
  const customUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  const skip = req.query.skip || '0';
  const take = req.query.take || '5';
  const betState = req.query.betState || 'Won';

  console.log(`[Bet261] Fetching history: skip=${skip}, take=${take}, state=${betState}, op=${operatorId}`);

  try {
    const fetchHistory = async (op: string) => {
      const sendReq = async (useBearer: boolean, platformId: string) => {
        let cleanToken = token;
        while (cleanToken.toLowerCase().startsWith('bearer ')) {
          cleanToken = cleanToken.substring(7).trim();
        }
        const authHeader = useBearer ? `Bearer ${cleanToken}` : cleanToken;

        const headers: any = {
          'Authorization': authHeader,
          'OperatorID': op,
          'PlatformID': platformId,
          'Origin': 'https://bet261.mg',
          'Referer': 'https://bet261.mg/',
          'X-Forwarded-For': madaIP,
          'X-Real-IP': madaIP,
          'True-Client-IP': madaIP,
          'Client-IP': madaIP,
          'Forwarded': `for=${madaIP}`,
          'User-Agent': customUserAgent,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-HH-Language': 'fr-FR',
          'X-HH-Platform': platformId === '4' ? 'web_mobile' : 'web'
        };

        if (customCookie) {
          headers['Cookie'] = cleanCookieHeader(customCookie);
        }

        return await undiciFetch(`https://hg-customer-api-prod.sporty-tech.net/api/reporting/history?skip=${skip}&take=${take}&betState=${betState}`, {
          headers
        });
      };

      const tryAllCombos = async () => {
        const platforms = ['1', '4'];
        const bearers = [true, false];
        for (const p of platforms) {
          for (const b of bearers) {
            const r = await sendReq(b, p);
            if (r.ok) return r;
          }
        }
        return null;
      };

      let res = await tryAllCombos();
      if (res && res.ok) return res;

      return await sendReq(true, '1');
    };

    let response = await fetchHistory(operatorId);

    if ((response.status === 401 || response.status === 403) && (operatorId === '34' || operatorId === '1')) {
      const altOp = operatorId === '34' ? '1' : '34';
      const retryResponse = await fetchHistory(altOp);
      if (retryResponse.ok) response = retryResponse;
    }

    const responseText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch history', details: responseText });
    }

    const data = JSON.parse(responseText);
    res.json(data);
  } catch (err: any) {
    console.error(`[Bet261] History exception: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch history', details: err.message });
  }
});

// Refactored Round Proxy
app.get('/api/data/round/:roundNumber', async (req, res) => {
  const { roundNumber } = req.params;
  const { eventCategoryId } = req.query;
  if (!eventCategoryId || eventCategoryId === 'undefined') return res.status(400).json({ error: 'eventCategoryId is required' });

  const url = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/round/${roundNumber}?eventCategoryId=${eventCategoryId}&getNext=false`;
  try {
    const data = await fetchWithRetry(url, 'round');
    res.json(data.data || data);
  } catch (err: any) {
    res.json({ round: { matches: [], id: roundNumber, roundNumber } });
  }
});

// Refactored Playout Proxy 
app.get('/api/data/round/:roundNumber/playout', async (req, res) => {
  const { roundNumber } = req.params;
  const { eventCategoryId, parentEventCategoryId = '8056' } = req.query;
  if (!eventCategoryId || eventCategoryId === 'undefined') return res.status(400).json({ error: 'eventCategoryId is required' });

  const url = `https://hg-event-api-prod.sporty-tech.net/api/instantleagues/round/${roundNumber}/playout?eventCategoryId=${eventCategoryId}&parentEventCategoryId=${parentEventCategoryId}`;
  console.log(`[Playout] Fetching round ${roundNumber} (Cat: ${eventCategoryId}, Parent: ${parentEventCategoryId})`);
  try {
    const data = await fetchWithRetry(url, 'playout');
    const matchesCount = data?.data?.matches?.length || data?.matches?.length || 0;
    const matchesWithGoals = (data?.data?.matches || data?.matches || []).filter((m: any) => m.goals && m.goals.length > 0).length;
    console.log(`[Playout] Received ${matchesCount} matches for round ${roundNumber} (${matchesWithGoals} with goals)`);
    res.json(data.data || data);
  } catch (err: any) {
    console.warn(`[Playout] Error for round ${roundNumber}:`, err.message);
    res.json({ matches: [] });
  }
});

// Minimal scraper status for the UI
app.get('/api/scraper/status', (_req, res) => {
  res.json({ isRunning: false, enabledLeagues: LEAGUES.map(l => l.id), logs: serverLogs });
});

app.get('/api/scraper/logs', (_req, res) => {
  res.json(serverLogs);
});

// Mock run endpoint for the manual sync button in App.tsx
app.post('/api/scraper/run', (_req, res) => {
  addServerLog("Synchronisation manuelle demandée", 'info');
  res.json({ success: true });
});

// IA Algo - Reverse Engineering the Game Generator Simulation engine using Gemini
app.post('/api/ia-algo/analyze', async (req, res) => {
  const { leagueId, leagueName, season, statsSummary } = req.body;

  if (!statsSummary) {
    return res.status(400).json({ error: "Aucune statistique fournie pour l'analyse." });
  }

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(400).json({
        error: "La clé d'API GEMINI_API_KEY n'est pas configurée dans les secrets de l'application."
      });
    }

    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemInstruction = 
      "Vous êtes un ingénieur expert en rétro-ingénierie et data science appliquée aux jeux de simulation virtuels (Virtual Football Games).\n" +
      "Votre rôle est d'inspecter les statistiques réelles de centaines de matchs pour décrypter 'l'algorithme de génération de score' du simulateur actuel.\n" +
      "Rédigez un rapport scientifique, méticuleux, limpide et orienté exploitation en français.\n" +
      "Identifiez les biais systématiques de l'algorithme : l'avantage à domicile, la corrélation cote/résultat, les limites physiques de buts par match, et les fenêtres de value bet.";

    const prompt = `Voici les statistiques compilées pour la ligue : ${leagueName} (ID: ${leagueId}), Saison : ${season || 'Toutes'}.
Nombre total de matchs analysés : ${statsSummary.totalMatches || 0}

RÉPARTITION DES RÉSULTATS :
- Victoires Domicile (1) : ${statsSummary.homeWins} (${statsSummary.homeWinPct}%)
- Matchs Nuls (X) : ${statsSummary.draws} (${statsSummary.drawPct}%)
- Victoires Extérieur (2) : ${statsSummary.awayWins} (${statsSummary.awayWinPct}%)

BUTS & SCORES :
- Buts moyen Domicile : ${statsSummary.avgHomeGoals} par match
- Buts moyen Extérieur : ${statsSummary.avgAwayGoals} par match
- Total buts moyen global : ${statsSummary.avgTotalGoals} par match
- Taux de matchs Over 1.5 : ${statsSummary.over15Pct}%
- Taux de matchs Over 2.5 : ${statsSummary.over25Pct}%
- Taux de matchs Over 3.5 : ${statsSummary.over35Pct}%
- Taux de matchs BTTS (Les Deux Marquent) : ${statsSummary.bttsPct}%

TOP FREQUENCES DE SCORES :
${JSON.stringify(statsSummary.scoreFrequencies, null, 2)}

RÉUSSITE DES FAVORIS DU BOOKMAKER (Cote la plus basse) :
- Le favori s'impose : ${statsSummary.favoriteWinPct}% du temps
- Taux de surprise totale (Outsider cote > 3.00 s'impose seul ou écart classement flagrant) : ${statsSummary.surpriseRatePct}%
- Taux de réussite du favori selon le lieu :
  - Favori à domicile s'impose : ${statsSummary.favHomeWinPct}%
  - Favori à l'extérieur s'impose : ${statsSummary.favAwayWinPct}%

COMPORTEMENT PAR PLAGES DE COTES DU FAVORIT :
- Plage Très Safe (cote <= 1.50) : réussite de ${statsSummary.safeOddsSuccessPct}% du temps
- Plage Équilibrée (1.51 - 2.20) : réussite de ${statsSummary.midOddsSuccessPct}% du temps
- Plage Risquée (cote > 2.20) : réussite de ${statsSummary.highOddsSuccessPct}% du temps

ÉCHANTILLON CHRONOLOGIQUE DE MATCHS RECENTS :
${JSON.stringify(statsSummary.recentMatchesSample, null, 2)}

Consignes pour votre rapport :
Structurez votre rapport avec les sections suivantes :
1. ANALYSE CRITIQUE : Calculer précisément l'avantage à domicile sous forme de pourcentage de sur-performance et de coefficient multiplicateur de buts attribué par l'algorithme.
2. DÉCRYPTAGE DU MOTEUR DE TRANSITION : Est-ce de purs tirages conformes aux cotes ou l'algorithme favorise-t-il les nuls ou les défaites de favoris à des moments précis ? Mettez en évidence les anomalies notables.
3. MODÈLE DE BUTS (CAP DE PIERRE) : Analysez si les buts suivent une distribution de Poisson pure, ou s'il y a un cap rigide appliqué par la simulation pour éviter l'abus de over/under.
4. RÈGLES D'EXPLOITATION CHIRURGICALE : Formulez des lois d'or mathématiques, des seuils de Value Bets ou des tunnels exacts de scores exploitables par notre bot automatique.

Restez objectif, hautement analytique et utilisez une mise en page Markdown riche.`;

    // Try multiple models sequentially with small delay on transient 503/429/etc
    const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let lastError: any = null;
    let analysisResult = "";

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      console.log(`[IA-Algo] Attempting generation with model: ${model} (Attempt ${i + 1}/${modelsToTry.length})...`);
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.1,
          }
        });
        if (response && response.text) {
          analysisResult = response.text;
          console.log(`[IA-Algo] Successfully generated analysis with model: ${model}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[IA-Algo] Error with model "${model}":`, err.message || err);
        if (i < modelsToTry.length - 1) {
          const delayMs = 1500 * (i + 1);
          console.log(`[IA-Algo] Waiting ${delayMs}ms before attempting with next model...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    if (!analysisResult) {
      throw lastError || new Error("Tous les modèles d'analyse IA ont échoué.");
    }

    res.json({ analysis: analysisResult });
  } catch (err: any) {
    console.error("[IA-Algo Error]:", err);
    res.status(500).json({ error: "Une erreur est survenue lors de l'analyse IA de l'algorithme.", details: err.message });
  }
});

// IA Correlation Analysis Endpoint for Advanced H2H
app.post('/api/ia-algo/h2h-correlation', async (req, res) => {
  const { currentMatch, sameTeamsData, sameOddsData } = req.body;

  if (!currentMatch) {
    return res.status(400).json({ error: "Les données du match actuel sont requises." });
  }

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(400).json({
        error: "La clé d'API GEMINI_API_KEY n'est pas configurée dans les secrets de l'application."
      });
    }

    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemInstruction = 
      "Vous êtes un analyste prédictif senior spécialisé dans le football virtuel et les statistiques de paris sportifs.\n" +
      "Votre fonction est d'analyser mathématiquement la corrélation entre les cotes bookmakers (v1, vX, v2), leurs variations, et les scores ou résultats réels constatés lors des matchs historiques.\n" +
      "Rédigez une étude de corrélation scientifique, claire, directe et actionnable en français pour le joueur.\n" +
      "Mettez en lumière l'influence directe des variations de cotes (baisses ou hausses de cotes sur le 1, N, ou 2) sur l'écart de buts final et les scores exacts réordonnés chronologiquement.";

    const prompt = `Étude de Corrélation IA : Cotes, Variations et Scores

MATCH ACTUEL CONTEXTE :
- Équipes : ${currentMatch.homeTeam} vs ${currentMatch.awayTeam}
- Cotes actuelles : 1: [${currentMatch.odds1 || '-'}], N/X: [${currentMatch.oddsX || '-'}], 2: [${currentMatch.odds2 || '-'}]

DONNÉES HISTORIQUES H2H DIRECTS (Mêmes Équipes, chronologique) :
${JSON.stringify(sameTeamsData || [], null, 2)}

DONNÉES HISTORIQUES SIMILAIRES (Mêmes Cotes des Bookmakers, équipes différentes) :
${JSON.stringify(sameOddsData || [], null, 2)}

Consignes d'analyse :
Fournissez un rapport structuré avec les sections suivantes (utilisez un ton scientifique et rigoureux, avec mise en page Markdown soignée) :

1. ⚖️ CORRÉLATION DES COTES DE BASE :
   Analyser comment les cotes de démarrage (1, N, 2) se corrèlent avec l'issue finale (Victoire 1, Nul X, ou Victoire 2) et l'écart type de buts. Le favori théorique s'est-il imposé systématiquement ? Y a-t-il un score récurrent associé à une tranche de cotes précise ?

2. 📈 INFLUENCE DES VARIATIONS DE COTES :
   (Important !) En analysant les champs de différence de cote (diffs ou variations par rapport au match de saison précédente / rounds proches), déterminez l'impact d'une hausse ou baisse de cote sur le comportement de l'algorithme de score. Par exemple, une baisse de la cote de Victoire 1 entraîne-t-elle statistiquement un "Over" de buts ou un score plus large ?

3. 🔍 ANOMALIES & SIGNES AVANT-COUREURS :
   Identifiez de subtiles anomalies ou signatures algorithmiques spécifiques à ces deux équipes ou à cette configuration de cotes (p. ex : une cote nulle stable à X.XX provoque systématiquement un certain score ou un certain cap de buts).

4. 🎯 RECOMMANDATIONS CHIRURGICALES (CONSEILS PRONOSTIC) :
   Donnez les pronostics optimaux (1X2, Over/Under, double chance, scores probables exacts) justifiés par cette étude de corrélation, avec pourcentage de confiance.

Calculer et estimer les probabilités sur la base stricte de cet échantillon fourni.`;

    const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let lastError: any = null;
    let correlationResult = "";

    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      console.log(`[IA-Correlation] Trying model: ${model}...`);
      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.15,
          }
        });
        if (response && response.text) {
          correlationResult = response.text;
          console.log(`[IA-Correlation] Successfully analyzed correlation with ${model}`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[IA-Correlation] Error with ${model}:`, err.message || err);
        if (i < modelsToTry.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }

    if (!correlationResult) {
      throw lastError || new Error("Tous les modèles d'analyse de corrélation ont échoué.");
    }

    res.json({ analysis: correlationResult });
  } catch (err: any) {
    console.error("[IA-Correlation Error]:", err);
    res.status(500).json({ error: "Une erreur est survenue lors de l'analyse IA.", details: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    ws.send(JSON.stringify({ message: 'Connected to Mahakasa Server' }));
  });
}

startServer();
