const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const QRCode = require('qrcode');
const pino = require('pino');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const authDir = path.join(__dirname, 'baileys_auth_info');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

// Copy default avatar SVG if missing
const defaultAvatarPath = path.join(uploadsDir, 'default_avatar.svg');
if (!fs.existsSync(defaultAvatarPath)) {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24" fill="#64748b"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-3.8-1.04-4.83-2.61.03-1.6 3.22-2.48 4.83-2.48s4.8 1.88 4.83 2.48C15.8 18.96 14.03 20 12 20z"/></svg>`;
  fs.writeFileSync(defaultAvatarPath, svgContent);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Multer Upload configuration (Multiple Photos & PDF Documents, max 30MB each, up to 10 files)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'upload-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB per file
});
const uploadMiddleware = upload.fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'attachment', maxCount: 1 }
]);

function extractUploadedFiles(req) {
  let list = [];
  if (req.files) {
    if (Array.isArray(req.files.attachments)) list = list.concat(req.files.attachments);
    if (Array.isArray(req.files.attachment)) list = list.concat(req.files.attachment);
    if (Array.isArray(req.files)) list = list.concat(req.files);
  }
  if (req.file) list.push(req.file);
  return list;
}

// Reusable Baileys Dispatcher for Text, Multiple Images, and PDF / Documents
async function sendBaileysMessageWithAttachments(jid, textMessage, files = []) {
  if (!files || files.length === 0) {
    return await sock.sendMessage(jid, { text: textMessage || '' });
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let mediaPath = '';
    let mimetype = file.mimetype || 'application/octet-stream';
    let originalName = file.originalname || 'document';

    if (file.path) {
      mediaPath = file.path;
    } else if (file.filename) {
      mediaPath = path.join(uploadsDir, file.filename);
    } else if (typeof file === 'string') {
      mediaPath = path.join(__dirname, 'public', file);
    } else if (file.url) {
      mediaPath = path.join(__dirname, 'public', file.url);
    }

    if (!fs.existsSync(mediaPath)) {
      console.error('Attachment file not found at:', mediaPath);
      continue;
    }

    const fileBuffer = fs.readFileSync(mediaPath);
    const ext = path.extname(mediaPath).toLowerCase();
    const isImage = mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    const caption = (i === 0) ? (textMessage || '') : '';

    if (isImage) {
      await sock.sendMessage(jid, {
        image: fileBuffer,
        caption: caption,
        mimetype: mimetype.startsWith('image/') ? mimetype : 'image/jpeg'
      });
    } else {
      // PDF or Document
      const docMime = ext === '.pdf' ? 'application/pdf' : mimetype;
      const cleanFileName = originalName && originalName.endsWith(ext) ? originalName : (originalName + ext);
      await sock.sendMessage(jid, {
        document: fileBuffer,
        fileName: cleanFileName,
        mimetype: docMime,
        caption: caption
      });
    }

    if (i < files.length - 1) {
      await new Promise(r => setTimeout(r, 1200)); // 1.2s delay between multiple files
    }
  }
}

const crypto = require('crypto');

// JSON File DB Helpers
const OFFICERS_FILE = path.join(dataDir, 'officers.json');
const CUSTOMERS_FILE = path.join(dataDir, 'customers.json');
const HISTORY_FILE = path.join(dataDir, 'history.json');
const USERS_FILE = path.join(dataDir, 'users.json');
const TOKENS_FILE = path.join(dataDir, 'tokens.json');
const SCHEDULED_FILE = path.join(dataDir, 'scheduled.json');
const APPROVALS_FILE = path.join(dataDir, 'approvals.json');
const SETTINGS_FILE = path.join(dataDir, 'settings.json');
const DS_SIGNATURE_FILE = path.join(__dirname, 'public', 'assets', 'ds_signature.jpg');

function readTokens() {
  try {
    if (!fs.existsSync(TOKENS_FILE)) return {};
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveToken(token, userSession) {
  const tokens = readTokens();
  tokens[token] = userSession;
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving token:', err);
  }
}

function getSessionUser(token) {
  if (!token) return null;
  const tokens = readTokens();
  return tokens[token] || null;
}

function readJSON(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// Baileys WhatsApp Engine Setup
let sock = null;
let whatsappStatus = 'initializing'; // initializing, connecting, qr, authenticated, ready, disconnected
let qrCodeDataURL = null;
let clientInfo = null;
let keepAliveTimer = null;

function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(async () => {
    if (sock && whatsappStatus === 'ready') {
      try {
        await sock.sendPresenceUpdate('available');
      } catch (e) {
        // Ignored
      }
    }
  }, 40 * 1000); // Send availability ping every 40s to keep socket alive
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

async function connectToWhatsApp() {
  try {
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch (e) {}
      sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    let version = [2, 3000, 1015901307];
    try {
      const v = await fetchLatestBaileysVersion();
      if (v && v.version) version = v.version;
    } catch (ve) {
      // Fallback version is used if network lookup is slow
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.windows('Desktop'),
      keepAliveIntervalMs: 30000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      retryRequestDelayMs: 500,
      getMessage: async () => {
        return { conversation: '' };
      }
    });

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (err) {
        console.error('Error saving WhatsApp credentials:', err);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('New WhatsApp QR Code generated for Baileys.');
        try {
          qrCodeDataURL = await QRCode.toDataURL(qr);
          whatsappStatus = 'qr';
        } catch (err) {
          console.error('QR code generation error:', err);
        }
      }

      if (connection === 'connecting') {
        if (whatsappStatus !== 'qr') {
          whatsappStatus = 'connecting';
        }
      } else if (connection === 'open') {
        console.log('===================================================');
        console.log('WhatsApp connection OPEN & READY (Baileys Engine)!');
        console.log('===================================================');
        whatsappStatus = 'ready';
        qrCodeDataURL = null;
        const rawUser = sock.user ? sock.user.id.split(':')[0] : 'Office Number';
        clientInfo = { wid: rawUser };
        startKeepAlive();
      } else if (connection === 'close') {
        stopKeepAlive();
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`WhatsApp connection closed. Code: ${statusCode}`);

        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          console.log('Session unlinked from phone (401). Cleaning auth state...');
          whatsappStatus = 'disconnected';
          qrCodeDataURL = null;
          clientInfo = null;
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch (e) {}
          setTimeout(connectToWhatsApp, 3000);
        } else {
          // Reconnect automatically for all normal network drops, 515 restartRequired, and 408 timeout
          console.log(`Reconnecting WhatsApp automatically (Code: ${statusCode})...`);
          whatsappStatus = 'connecting';
          setTimeout(connectToWhatsApp, 2500);
        }
      }
    });
  } catch (err) {
    console.error('Failed to connect to Baileys WhatsApp engine:', err);
    whatsappStatus = 'disconnected';
    setTimeout(connectToWhatsApp, 5000);
  }
}

connectToWhatsApp();

// Helper: Resolve Phone to WhatsApp JID
async function resolveJid(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, ''); // Remove non-digits
  
  // Format Sri Lankan numbers (0771234567 -> 94771234567)
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '94' + cleaned.substring(1);
  }

  try {
    if (sock && whatsappStatus === 'ready') {
      const results = await sock.onWhatsApp(cleaned);
      if (results && results.length > 0 && results[0].exists) {
        return results[0].jid;
      }
    }
  } catch (err) {
    console.error('onWhatsApp lookup error:', err.message);
  }

  return cleaned.endsWith('@s.whatsapp.net') ? cleaned : `${cleaned}@s.whatsapp.net`;
}

// Auth Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.query.token;
  const user = getSessionUser(token);
  if (!token || !user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in with a valid Section Head password.' });
  }
  req.user = user;
  next();
}

// --- AUTH ENDPOINTS ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE, []);
  
  const cleanUser = (username || '').toLowerCase().trim();
  const cleanPass = (password || '').trim();

  const user = users.find(u => u.username.toLowerCase().trim() === cleanUser && u.password.trim() === cleanPass);
  if (!user) {
    return res.status(401).json({ error: 'Invalid Username or Password. Please check for spelling or spaces.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const userSession = { id: user.id, username: user.username, name: user.name, role: user.role };
  saveToken(token, userSession);

  res.json({
    success: true,
    token,
    user: userSession
  });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.query.token;
  const user = getSessionUser(token);
  if (token && user) {
    return res.json({ authenticated: true, user });
  }
  res.json({ authenticated: false });
});

app.post('/api/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters.' });
  }
  
  const users = readJSON(USERS_FILE, []);
  const uIndex = users.findIndex(u => u.id === req.user.id);
  if (uIndex === -1) return res.status(404).json({ error: 'User not found.' });

  if (users[uIndex].password !== oldPassword) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  users[uIndex].password = newPassword;
  writeJSON(USERS_FILE, users);
  res.json({ success: true, message: 'Password updated successfully!' });
});

// List Sections (Lightweight for dropdowns and filters)
app.get('/api/sections', (req, res) => {
  const users = readJSON(USERS_FILE, []);
  const sections = users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role
  }));
  res.json(sections);
});

// User / Section Management (Admin Only)
app.get('/api/users', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  const users = readJSON(USERS_FILE, []);
  res.json(users);
});

app.post('/api/users', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  const { username, password, name, role } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password and section name are required.' });
  }

  const cleanUser = username.toLowerCase().trim();
  const users = readJSON(USERS_FILE, []);
  if (users.some(u => u.username.toLowerCase().trim() === cleanUser)) {
    return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    username: cleanUser,
    password: password.trim(),
    name: name.trim(),
    role: role || 'section_user'
  };

  users.push(newUser);
  writeJSON(USERS_FILE, users);
  res.json({ success: true, message: 'Section account created successfully!', user: newUser });
});

app.put('/api/users/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  const { id } = req.params;
  const { username, password, name, role } = req.body;

  const users = readJSON(USERS_FILE, []);
  const uIndex = users.findIndex(u => u.id === id);
  if (uIndex === -1) {
    return res.status(404).json({ error: 'Section account not found.' });
  }

  if (username) {
    const cleanUser = username.toLowerCase().trim();
    if (users.some(u => u.id !== id && u.username.toLowerCase().trim() === cleanUser)) {
      return res.status(400).json({ error: 'Username already in use by another account.' });
    }
    users[uIndex].username = cleanUser;
  }

  if (name) users[uIndex].name = name.trim();
  if (password && password.trim()) users[uIndex].password = password.trim();
  if (role && id !== 'usr_1') users[uIndex].role = role;

  writeJSON(USERS_FILE, users);
  res.json({ success: true, message: 'Section account updated successfully!', user: users[uIndex] });
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  const { id } = req.params;
  if (id === 'usr_1' || id === req.user.id) {
    return res.status(400).json({ error: 'Main Administrator account cannot be deleted.' });
  }

  let users = readJSON(USERS_FILE, []);
  const beforeCount = users.length;
  users = users.filter(u => u.id !== id);

  if (users.length === beforeCount) {
    return res.status(404).json({ error: 'Section account not found.' });
  }

  writeJSON(USERS_FILE, users);
  res.json({ success: true, message: 'Section account removed successfully!' });
});

// --- API ENDPOINTS ---

// WhatsApp Connection Status
app.get('/api/status', (req, res) => {
  res.json({
    status: whatsappStatus,
    qrCode: qrCodeDataURL,
    info: clientInfo
  });
});

// Force WhatsApp Reconnection / QR Refresh
app.post('/api/whatsapp/reconnect', async (req, res) => {
  try {
    console.log('Manual WhatsApp reconnect requested...');
    whatsappStatus = 'connecting';
    qrCodeDataURL = null;
    connectToWhatsApp();
    res.json({ success: true, message: 'Reconnecting to WhatsApp and generating QR code...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout WhatsApp Session (Admin Only)
app.post('/api/logout', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Only Administrator can disconnect WhatsApp.' });
  }
  try {
    if (sock && (whatsappStatus === 'ready' || whatsappStatus === 'authenticated')) {
      await sock.logout();
    }
    whatsappStatus = 'disconnected';
    qrCodeDataURL = null;
    clientInfo = null;
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch (e) {}
    setTimeout(connectToWhatsApp, 2000);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Officers CRUD
app.get('/api/officers', (req, res) => {
  let officers = readJSON(OFFICERS_FILE, []);
  const q = req.query.q ? req.query.q.toLowerCase().trim() : '';
  
  if (q) {
    officers = officers.filter(off =>
      (off.name && off.name.toLowerCase().includes(q)) ||
      (off.designation && off.designation.toLowerCase().includes(q)) ||
      (off.department && off.department.toLowerCase().includes(q)) ||
      (off.phone && off.phone.includes(q))
    );
  }
  res.json(officers);
});

app.post('/api/officers', requireAuth, upload.single('photo'), (req, res) => {
  const officers = readJSON(OFFICERS_FILE, []);
  const { name, designation, department, phone, notes } = req.body;
  
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and Phone number are required.' });
  }
  
  const photo = req.file ? '/uploads/' + req.file.filename : '/uploads/default_avatar.svg';
  const newOfficer = {
    id: 'off_' + Date.now(),
    name,
    designation: designation || '',
    department: department || '',
    phone,
    photo,
    notes: notes || '',
    createdAt: new Date().toISOString()
  };
  
  officers.push(newOfficer);
  writeJSON(OFFICERS_FILE, officers);
  res.status(201).json(newOfficer);
});

app.put('/api/officers/:id', requireAuth, upload.single('photo'), (req, res) => {
  const officers = readJSON(OFFICERS_FILE, []);
  const index = officers.findIndex(o => o.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Officer not found.' });
  }
  
  const { name, designation, department, phone, notes } = req.body;
  const existing = officers[index];
  
  const updatedOfficer = {
    ...existing,
    name: name || existing.name,
    designation: designation !== undefined ? designation : existing.designation,
    department: department !== undefined ? department : existing.department,
    phone: phone || existing.phone,
    photo: req.file ? '/uploads/' + req.file.filename : existing.photo,
    notes: notes !== undefined ? notes : existing.notes,
    updatedAt: new Date().toISOString()
  };
  
  officers[index] = updatedOfficer;
  writeJSON(OFFICERS_FILE, officers);
  res.json(updatedOfficer);
});

app.delete('/api/officers/:id', requireAuth, (req, res) => {
  let officers = readJSON(OFFICERS_FILE, []);
  const filtered = officers.filter(o => o.id !== req.params.id);
  writeJSON(OFFICERS_FILE, filtered);
  res.json({ success: true, message: 'Officer deleted.' });
});

// --- CUSTOMER / PUBLIC FILES CRUD ---
app.get('/api/customers', (req, res) => {
  let customers = readJSON(CUSTOMERS_FILE, []);
  const q = req.query.q ? req.query.q.toLowerCase().trim() : '';
  
  if (q) {
    customers = customers.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.fileNo && c.fileNo.toLowerCase().includes(q)) ||
      (c.idNo && c.idNo.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  }
  res.json(customers);
});

app.post('/api/customers', requireAuth, (req, res) => {
  const customers = readJSON(CUSTOMERS_FILE, []);
  const { fileNo, name, idNo, address, phone, notes } = req.body;
  
  if (!name || !phone) {
    return res.status(400).json({ error: 'Customer Name and Phone number are required.' });
  }
  
  const newCustomer = {
    id: 'cust_' + Date.now(),
    fileNo: fileNo || 'DSB/REC/' + Date.now().toString().slice(-4),
    name,
    idNo: idNo || '',
    address: address || '',
    phone,
    notes: notes || '',
    createdAt: new Date().toISOString()
  };
  
  customers.push(newCustomer);
  writeJSON(CUSTOMERS_FILE, customers);
  res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', requireAuth, (req, res) => {
  const customers = readJSON(CUSTOMERS_FILE, []);
  const index = customers.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Customer record not found.' });
  }
  
  const { fileNo, name, idNo, address, phone, notes } = req.body;
  const existing = customers[index];
  
  const updatedCustomer = {
    ...existing,
    fileNo: fileNo !== undefined ? fileNo : existing.fileNo,
    name: name || existing.name,
    idNo: idNo !== undefined ? idNo : existing.idNo,
    address: address !== undefined ? address : existing.address,
    phone: phone || existing.phone,
    notes: notes !== undefined ? notes : existing.notes,
    updatedAt: new Date().toISOString()
  };
  
  customers[index] = updatedCustomer;
  writeJSON(CUSTOMERS_FILE, customers);
  res.json(updatedCustomer);
});

app.delete('/api/customers/:id', requireAuth, (req, res) => {
  let customers = readJSON(CUSTOMERS_FILE, []);
  const filtered = customers.filter(c => c.id !== req.params.id);
  writeJSON(CUSTOMERS_FILE, filtered);
  res.json({ success: true, message: 'Customer record deleted.' });
});

// Send Message / Multiple Images / PDF Documents via WhatsApp (Baileys Engine)
app.post('/api/send', requireAuth, uploadMiddleware, async (req, res) => {
  if (whatsappStatus !== 'ready' || !sock) {
    return res.status(400).json({
      error: 'WhatsApp is not ready. Please scan the QR code to connect.'
    });
  }

  const { officerId, phone, message } = req.body;
  const files = extractUploadedFiles(req);

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  if (!message && files.length === 0) {
    return res.status(400).json({ error: 'Message content or at least one attachment is required.' });
  }

  const jid = await resolveJid(phone);
  let officerName = 'Unknown Officer';

  if (officerId) {
    const officers = readJSON(OFFICERS_FILE, []);
    const off = officers.find(o => o.id === officerId);
    if (off) officerName = off.name;
  }

  try {
    // Send text / multiple images / PDF documents sequentially
    await sendBaileysMessageWithAttachments(jid, message, files);

    const attachmentsList = files.map(f => '/uploads/' + f.filename);

    // Save history log
    const history = readJSON(HISTORY_FILE, []);
    const newLog = {
      id: 'msg_' + Date.now(),
      officerId: officerId || null,
      officerName,
      phone,
      message: message || '',
      attachment: attachmentsList.length > 0 ? attachmentsList[0] : null,
      attachments: attachmentsList,
      timestamp: new Date().toISOString(),
      status: 'SENT',
      sentBy: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.name,
        role: req.user.role
      }
    };
    history.unshift(newLog);
    writeJSON(HISTORY_FILE, history);

    res.json({ success: true, message: 'Message sent successfully!', log: newLog });
  } catch (err) {
    console.error('Baileys Send Error:', err);
    res.status(500).json({
      error: 'Failed to send WhatsApp message.',
      details: err.message
    });
  }
});

// Send Bulk WhatsApp Messages (Multiple Images & PDF Documents supported)
app.post('/api/send-bulk', requireAuth, uploadMiddleware, async (req, res) => {
  if (whatsappStatus !== 'ready' || !sock) {
    return res.status(400).json({
      error: 'WhatsApp is not ready. Please scan the QR code to connect.'
    });
  }

  let recipients = [];
  try {
    recipients = typeof req.body.recipients === 'string' ? JSON.parse(req.body.recipients) : req.body.recipients;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid recipients format.' });
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'At least one recipient must be selected.' });
  }

  const { message } = req.body;
  const files = extractUploadedFiles(req);

  if (!message && files.length === 0) {
    return res.status(400).json({ error: 'Message content or at least one attachment is required.' });
  }

  const attachmentsList = files.map(f => '/uploads/' + f.filename);
  const history = readJSON(HISTORY_FILE, []);
  let sentCount = 0;
  let failedCount = 0;
  const newLogs = [];

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < recipients.length; i++) {
    const item = recipients[i];
    if (!item.phone) continue;

    try {
      const jid = await resolveJid(item.phone);
      
      let finalMessage = message || '';
      if (item.name && finalMessage.includes('{name}')) {
        finalMessage = finalMessage.replace(/\{name\}/g, item.name);
      }
      if (item.fileNo && finalMessage.includes('{fileNo}')) {
        finalMessage = finalMessage.replace(/\{fileNo\}/g, item.fileNo);
      }

      await sendBaileysMessageWithAttachments(jid, finalMessage, files);

      sentCount++;
      const log = {
        id: 'msg_' + Date.now() + '_' + i,
        officerId: item.id || null,
        officerName: item.name || 'Recipient',
        phone: item.phone,
        message: finalMessage,
        attachment: attachmentsList.length > 0 ? attachmentsList[0] : null,
        attachments: attachmentsList,
        timestamp: new Date().toISOString(),
        status: 'SENT',
        sentBy: {
          id: req.user.id,
          username: req.user.username,
          name: req.user.name,
          role: req.user.role
        }
      };
      history.unshift(log);
      newLogs.push(log);

      if (i < recipients.length - 1) {
        await delay(1500); // 1.5s delay between dispatches
      }
    } catch (err) {
      console.error(`Bulk send error for ${item.phone}:`, err.message);
      failedCount++;
    }
  }

  writeJSON(HISTORY_FILE, history);

  res.json({
    success: true,
    message: `Dispatched ${sentCount} message(s) successfully.${failedCount > 0 ? ` (${failedCount} failed)` : ''}`,
    sentCount,
    failedCount,
    logs: newLogs
  });
});

// --- SCHEDULED MESSAGES SYSTEM ---

// 1. Create a Scheduled Message (Single or Bulk, Multiple Photos & PDFs)
app.post('/api/schedule', requireAuth, uploadMiddleware, async (req, res) => {
  const { scheduledAt, isBulk, recipients, officerId, phone, recipientName, message } = req.body;
  const files = extractUploadedFiles(req);

  if (!scheduledAt) {
    return res.status(400).json({ error: 'Scheduled date & time is required.' });
  }

  const targetDate = new Date(scheduledAt);
  if (isNaN(targetDate.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduled date & time format.' });
  }

  if (targetDate.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future.' });
  }

  if (!message && files.length === 0) {
    return res.status(400).json({ error: 'Message content or at least one attachment is required.' });
  }

  const isBulkBool = isBulk === 'true' || isBulk === true;
  let parsedRecipients = [];
  if (isBulkBool) {
    try {
      parsedRecipients = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid recipients format.' });
    }
    if (!Array.isArray(parsedRecipients) || parsedRecipients.length === 0) {
      return res.status(400).json({ error: 'At least one recipient must be selected.' });
    }
  } else {
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
  }

  const attachmentsData = files.map(f => ({
    url: '/uploads/' + f.filename,
    filename: f.filename,
    originalname: f.originalname,
    mimetype: f.mimetype
  }));

  const scheduledList = readJSON(SCHEDULED_FILE, []);
  const newScheduleItem = {
    id: 'sched_' + Date.now(),
    isBulk: isBulkBool,
    recipients: isBulkBool ? parsedRecipients : null,
    officerId: isBulkBool ? null : (officerId || null),
    phone: isBulkBool ? null : phone,
    recipientName: isBulkBool ? `${parsedRecipients.length} Recipients (Bulk)` : (recipientName || 'Recipient'),
    message: message || '',
    attachment: attachmentsData.length > 0 ? attachmentsData[0].url : null,
    attachments: attachmentsData,
    scheduledAt: targetDate.toISOString(),
    createdAt: new Date().toISOString(),
    status: 'PENDING',
    sentBy: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role
    }
  };

  scheduledList.unshift(newScheduleItem);
  writeJSON(SCHEDULED_FILE, scheduledList);

  res.json({
    success: true,
    message: `Message scheduled successfully for ${targetDate.toLocaleString()}!`,
    schedule: newScheduleItem
  });
});

// 2. Get Scheduled Messages
app.get('/api/scheduled', requireAuth, (req, res) => {
  const scheduledList = readJSON(SCHEDULED_FILE, []);
  let result = scheduledList;

  if (req.user.role !== 'admin') {
    result = result.filter(item =>
      item.sentBy && item.sentBy.username === req.user.username
    );
  }

  res.json(result);
});

// 3. Cancel / Delete Scheduled Message
app.delete('/api/scheduled/:id', requireAuth, (req, res) => {
  const scheduledList = readJSON(SCHEDULED_FILE, []);
  const index = scheduledList.findIndex(item => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Scheduled message not found.' });
  }

  const item = scheduledList[index];
  if (req.user.role !== 'admin' && (!item.sentBy || item.sentBy.username !== req.user.username)) {
    return res.status(403).json({ error: 'Access denied. You can only cancel your own scheduled messages.' });
  }

  scheduledList.splice(index, 1);
  writeJSON(SCHEDULED_FILE, scheduledList);

  res.json({ success: true, message: 'Scheduled message cancelled successfully.' });
});

// 4. Background Scheduled Dispatcher Worker
let isProcessingScheduled = false;

async function processScheduledQueue() {
  if (isProcessingScheduled) return;
  if (whatsappStatus !== 'ready' || !sock) return;

  isProcessingScheduled = true;
  try {
    const scheduledList = readJSON(SCHEDULED_FILE, []);
    const now = new Date();
    let modified = false;

    for (let item of scheduledList) {
      if (item.status === 'PENDING' && new Date(item.scheduledAt) <= now) {
        console.log(`[Scheduler] Dispatching scheduled item: ${item.id} (Scheduled for: ${item.scheduledAt})`);
        
        try {
          const filesToSend = (item.attachments && item.attachments.length > 0)
            ? item.attachments
            : (item.attachment ? [{ url: item.attachment, filename: path.basename(item.attachment), originalname: path.basename(item.attachment) }] : []);

          if (item.isBulk && Array.isArray(item.recipients)) {
            // Bulk dispatch
            for (let i = 0; i < item.recipients.length; i++) {
              const rec = item.recipients[i];
              if (!rec.phone) continue;
              try {
                const jid = await resolveJid(rec.phone);
                let finalMsg = item.message || '';
                if (rec.name && finalMsg.includes('{name}')) finalMsg = finalMsg.replace(/\{name\}/g, rec.name);
                if (rec.fileNo && finalMsg.includes('{fileNo}')) finalMsg = finalMsg.replace(/\{fileNo\}/g, rec.fileNo);

                await sendBaileysMessageWithAttachments(jid, finalMsg, filesToSend);

                const history = readJSON(HISTORY_FILE, []);
                history.unshift({
                  id: 'msg_sched_' + Date.now() + '_' + i,
                  officerId: rec.id || null,
                  officerName: rec.name || 'Recipient',
                  phone: rec.phone,
                  message: finalMsg,
                  attachment: filesToSend.length > 0 ? (filesToSend[0].url || filesToSend[0].filename) : null,
                  attachments: filesToSend.map(f => f.url || f.filename),
                  timestamp: new Date().toISOString(),
                  status: 'SENT',
                  scheduledFrom: item.id,
                  sentBy: item.sentBy
                });
                writeJSON(HISTORY_FILE, history);

                if (i < item.recipients.length - 1) {
                  await new Promise(r => setTimeout(r, 1500));
                }
              } catch (subErr) {
                console.error(`[Scheduler Bulk Error] ${rec.phone}:`, subErr.message);
              }
            }
          } else {
            // Single dispatch
            const jid = await resolveJid(item.phone);
            await sendBaileysMessageWithAttachments(jid, item.message, filesToSend);

            const history = readJSON(HISTORY_FILE, []);
            history.unshift({
              id: 'msg_sched_' + Date.now(),
              officerId: item.officerId || null,
              officerName: item.recipientName || 'Recipient',
              phone: item.phone,
              message: item.message || '',
              attachment: filesToSend.length > 0 ? (filesToSend[0].url || filesToSend[0].filename) : null,
              attachments: filesToSend.map(f => f.url || f.filename),
              timestamp: new Date().toISOString(),
              status: 'SENT',
              scheduledFrom: item.id,
              sentBy: item.sentBy
            });
            writeJSON(HISTORY_FILE, history);
          }

          item.status = 'SENT';
          item.executedAt = new Date().toISOString();
          modified = true;
        } catch (err) {
          console.error(`[Scheduler Error] Item ${item.id}:`, err.message);
          item.status = 'FAILED';
          item.error = err.message;
          item.lastAttemptAt = new Date().toISOString();
          modified = true;
        }
      }
    }

    if (modified) {
      writeJSON(SCHEDULED_FILE, scheduledList);
    }
  } catch (err) {
    console.error('[Scheduler Worker Error]:', err.message);
  } finally {
    isProcessingScheduled = false;
  }
}

// Check scheduled queue every 20 seconds
setInterval(processScheduledQueue, 20 * 1000);

// Message History with Section Tracking
app.get('/api/history', requireAuth, (req, res) => {
  const history = readJSON(HISTORY_FILE, []);
  const { section, q } = req.query;

  let result = history;

  if (req.user.role === 'admin') {
    // Admin can view all, or filter by specific section username
    if (section && section !== 'all') {
      result = result.filter(item =>
        item.sentBy && (item.sentBy.username === section || item.sentBy.role === section)
      );
    }
  } else {
    // Section accounts: view their own section's history
    result = result.filter(item =>
      item.sentBy && item.sentBy.username === req.user.username
    );
  }

  if (q) {
    const query = q.toLowerCase().trim();
    result = result.filter(item =>
      (item.officerName && item.officerName.toLowerCase().includes(query)) ||
      (item.phone && item.phone.includes(query)) ||
      (item.message && item.message.toLowerCase().includes(query)) ||
      (item.sentBy && item.sentBy.name && item.sentBy.name.toLowerCase().includes(query))
    );
  }

  res.json(result);
});

// Clear All Message History (Admin Only)
app.delete('/api/history', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Only Admin (Divisional Secretary) can clear message history.' });
  }
  writeJSON(HISTORY_FILE, []);
  res.json({ success: true, message: 'Message history cleared successfully!' });
});

// Delete Single Message History Item (Admin Only)
app.delete('/api/history/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Only Admin can delete history items.' });
  }
  let history = readJSON(HISTORY_FILE, []);
  history = history.filter(h => h.id !== req.params.id);
  writeJSON(HISTORY_FILE, history);
  res.json({ success: true, message: 'History record deleted.' });
});

// ==========================================
// BACKUP & RESTORE SYSTEM
// ==========================================
const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

function createSystemSnapshot(label = 'auto') {
  try {
    const snapshot = {
      appName: 'Divisional Secretariat Bandarawela - Office WhatsApp & E-Sign System',
      version: '1.0',
      label,
      timestamp: new Date().toISOString(),
      data: {
        officers: readJSON(OFFICERS_FILE, []),
        customers: readJSON(CUSTOMERS_FILE, []),
        history: readJSON(HISTORY_FILE, []),
        users: readJSON(USERS_FILE, []),
        approvals: readJSON(APPROVALS_FILE, []),
        scheduled: readJSON(SCHEDULED_FILE, []),
        settings: readJSON(SETTINGS_FILE, {})
      }
    };

    const cleanTime = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${label}_${cleanTime}.json`;
    const filePath = path.join(backupsDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

    // Keep only latest 25 snapshots to avoid disk clutter
    const allFiles = fs.readdirSync(backupsDir).filter(f => f.startsWith('backup_') && f.endsWith('.json'));
    if (allFiles.length > 25) {
      allFiles.sort().slice(0, allFiles.length - 25).forEach(f => {
        try { fs.unlinkSync(path.join(backupsDir, f)); } catch(e) {}
      });
    }

    console.log(`[Backup] System snapshot created: ${filename}`);
    return { filename, filePath };
  } catch (err) {
    console.error('[Backup Error] Failed to create snapshot:', err.message);
    return null;
  }
}

// Initial snapshot on server launch
createSystemSnapshot('startup');
// Periodic hourly snapshot
setInterval(() => { createSystemSnapshot('hourly'); }, 60 * 60 * 1000);

// ==========================================
// NETWORK IP & VERIFICATION URL RESOLVER
// ==========================================

function getLocalNetworkIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
          return alias.address;
        }
      }
    }
  } catch (e) {}
  return '10.7.108.15';
}

function getPublicServerBaseUrl(req) {
  // 1. Check if publicVerifyUrl is explicitly set in settings
  const settings = readJSON(SETTINGS_FILE, {});
  if (settings.publicVerifyUrl && settings.publicVerifyUrl.trim()) {
    return settings.publicVerifyUrl.trim().replace(/\/+$/, '');
  }

  // 2. Check environment variables
  if (process.env.PUBLIC_VERIFY_URL) {
    return process.env.PUBLIC_VERIFY_URL.trim().replace(/\/+$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.trim().replace(/\/+$/, '');
  }

  // 3. Fallback: Always use computer's Wi-Fi / LAN IP so smartphones on Wi-Fi can scan and open it!
  const lanIp = getLocalNetworkIp();
  const host = (req && req.get) ? req.get('host') : '';
  const port = (host && host.includes(':')) ? host.split(':')[1] : (process.env.PORT || 3000);

  // If request came from a real public domain / tunnel, preserve it
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.startsWith('10.') && !host.startsWith('192.168.')) {
    const protocol = (req && req.secure) ? 'https' : 'http';
    return `${protocol}://${host}`;
  }

  return `http://${lanIp}:${port}`;
}

// ==========================================
// --- E-SIGNATURE & DS APPROVAL PIPELINE ---
// ==========================================

async function stampPdfWithDsSignature(inputPdfPath, verificationCode, approvalDateStr, customPos = null, req = null) {
  try {
    if (!fs.existsSync(inputPdfPath)) {
      console.error('Input PDF not found:', inputPdfPath);
      return inputPdfPath;
    }
    if (!fs.existsSync(DS_SIGNATURE_FILE)) {
      console.error('DS signature file not found at:', DS_SIGNATURE_FILE);
      return inputPdfPath;
    }

    const existingPdfBytes = fs.readFileSync(inputPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    if (pages.length === 0) return inputPdfPath;

    // Stamp on the last page of the document
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    const sigImageBytes = fs.readFileSync(DS_SIGNATURE_FILE);
    const sigImage = await pdfDoc.embedJpg(sigImageBytes);

    // Official dimensions (signature width 135 pt)
    const sigWidth = 135;
    const sigHeight = (sigImage.height / sigImage.width) * sigWidth;
    const qrSize = 44; // 44 pt square QR code
    const totalBoxWidth = sigWidth + 8 + qrSize;

    // Position: Custom Position (if provided) or Default (Left 1 inch / 72 pt, Bottom 3 inches / 216 pt)
    let sigX = 72; // default 1 inch from left
    let sigY = 216; // default 3 inches from bottom

    if (customPos) {
      if (typeof customPos.xPercent === 'number' && typeof customPos.yPercent === 'number') {
        sigX = Math.max(10, Math.min(width - totalBoxWidth - 10, (customPos.xPercent / 100) * width));
        sigY = Math.max(25, Math.min(height - sigHeight - 20, height - ((customPos.yPercent / 100) * height) - sigHeight));
      } else if (typeof customPos.x === 'number' && typeof customPos.y === 'number') {
        sigX = Math.max(10, Math.min(width - totalBoxWidth - 10, customPos.x));
        sigY = Math.max(25, Math.min(height - sigHeight - 20, customPos.y));
      }
    }

    // 1. Draw Signature & Official Seal
    lastPage.drawImage(sigImage, {
      x: sigX,
      y: sigY,
      width: sigWidth,
      height: sigHeight
    });

    // 2. Generate Verification QR Code (Accessible by any mobile phone on Wi-Fi or Internet)
    let qrImage = null;
    const qrX = sigX + sigWidth + 6;
    const qrY = sigY + (sigHeight - qrSize) / 2;

    try {
      const baseUrl = getPublicServerBaseUrl(req);
      const verifyUrl = `${baseUrl}/verify/${verificationCode || 'BDS-APP'}`;
      console.log(`[E-Signature] QR Code generated with Target URL: ${verifyUrl}`);

      const qrBuffer = await QRCode.toBuffer(verifyUrl, {
        type: 'png',
        width: 140,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      qrImage = await pdfDoc.embedPng(qrBuffer);

      lastPage.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize
      });

      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      lastPage.drawText('Scan to Verify', {
        x: qrX + 2,
        y: qrY - 7,
        size: 5,
        font: helveticaBold,
        color: rgb(0.12, 0.28, 0.55)
      });
    } catch (qrErr) {
      console.error('[E-Signature] Failed to generate QR code on PDF:', qrErr.message);
    }

    // 3. Verification metadata texts under signature
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const refText = `Verified Digital Approval | Ref: ${verificationCode || 'BDS-APP'}`;
    const dateText = `Date: ${approvalDateStr || new Date().toLocaleString('en-GB')}`;

    lastPage.drawText(refText, {
      x: sigX,
      y: sigY - 11,
      size: 6.5,
      font: helveticaBold,
      color: rgb(0.12, 0.28, 0.55)
    });

    lastPage.drawText(dateText, {
      x: sigX,
      y: sigY - 19,
      size: 6.5,
      font: helvetica,
      color: rgb(0.35, 0.4, 0.45)
    });

    const modifiedPdfBytes = await pdfDoc.save();

    const dir = path.dirname(inputPdfPath);
    const ext = path.extname(inputPdfPath);
    const base = path.basename(inputPdfPath, ext);
    const signedFileName = `${base}-signed-${Date.now()}${ext}`;
    const signedPdfPath = path.join(dir, signedFileName);

    fs.writeFileSync(signedPdfPath, modifiedPdfBytes);
    console.log(`[E-Signature] Successfully stamped PDF with DS Seal & QR Code: ${signedFileName}`);
    return signedPdfPath;
  } catch (err) {
    console.error('Error stamping PDF with DS signature:', err);
    return inputPdfPath;
  }
}

// 1. Submit Request for DS Approval & E-Signature
app.post('/api/approvals/request', requireAuth, uploadMiddleware, async (req, res) => {
  try {
    const isBulk = req.body.isBulk === 'true';
    let recipients = [];
    let singleRecipient = null;

    if (isBulk && req.body.recipients) {
      try {
        recipients = JSON.parse(req.body.recipients);
      } catch (e) {
        recipients = [];
      }
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Recipients list is empty or invalid.' });
      }
    } else {
      const phone = (req.body.phone || '').trim();
      if (phone) {
        singleRecipient = {
          id: req.body.officerId || '',
          name: req.body.recipientName || 'Recipient',
          phone,
          fileNo: req.body.fileNo || ''
        };
      } else {
        // Internal Section Approval (No external recipient)
        singleRecipient = null;
      }
    }

    const message = (req.body.message || '').trim();
    const uploadedFiles = extractUploadedFiles(req);

    if (!message && uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'Please enter a message or attach at least one document.' });
    }

    const attachments = uploadedFiles.map(f => ({
      filename: f.filename,
      originalname: f.originalname,
      mimetype: f.mimetype,
      path: f.path,
      size: f.size
    }));

    const verificationCode = 'BDS-' + new Date().getFullYear() + '-APP-' + Math.floor(1000 + Math.random() * 9000);

    const approvalRequest = {
      id: 'appr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      requestedBy: {
        id: req.user.id || '',
        username: req.user.username || '',
        name: req.user.name || 'Section Head',
        role: req.user.role || ''
      },
      isBulk,
      recipients: isBulk ? recipients : [],
      recipient: isBulk ? null : singleRecipient,
      message,
      attachments,
      status: 'pending', // 'pending' | 'approved' | 'rejected'
      verificationCode,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionRemarks: null,
      signedFiles: []
    };

    const approvals = readJSON(APPROVALS_FILE, []);
    approvals.unshift(approvalRequest);
    writeJSON(APPROVALS_FILE, approvals);

    console.log(`[Approval Request] New approval submitted by ${req.user.name} (${verificationCode})`);

    // Asynchronously ping Divisional Secretary WhatsApp if alerts are enabled
    (async () => {
      try {
        const settings = readJSON(SETTINGS_FILE, { dsPhone: '0714435277', enableDsAlerts: true });
        if (settings.enableDsAlerts && settings.dsPhone && whatsappStatus === 'ready' && sock) {
          const dsJid = await resolveJid(settings.dsPhone);
          if (dsJid) {
            const shortMsg = message ? (message.length > 120 ? message.substring(0, 120) + '...' : message) : '[ලිපිගොනු සහ PDF පමණි]';
            const alertMsg = `🔔 *නව අනුමැති ඉල්ලීමක් (New Approval Request)*\n🏛️ *ප්‍රාදේශීය ලේකම් කාර්යාලය - බණ්ඩාරවෙල*\n*(Divisional Secretariat - Bandarawela)*\n━━━━━━━━━━━━━━━━━━━━\n📂 *ඉදිරිපත් කළ අංශය:* ${req.user.name}\n📑 *අනුමැති අංකය (Ref):* ${verificationCode}\n📅 *දිනය සහ වේලාව:* ${new Date().toLocaleString('si-LK')}\n📝 *විස්තරය:* ${shortMsg}\n📎 *අමුණා ඇති ලිපි:* ${attachments.length} Document(s)\n━━━━━━━━━━━━━━━━━━━━\n👉 *අනුමත කිරීම සඳහා කරුණාකර පද්ධතියට (Approval Hub) පිවිසෙන්න.*`;
            await sendBaileysMessageWithAttachments(dsJid, alertMsg, uploadedFiles);
            console.log(`[DS Alert Sent] WhatsApp ping delivered to DS (${settings.dsPhone}) with ${uploadedFiles.length} file(s) for ${verificationCode}`);
          }
        }
      } catch (alertErr) {
        console.error('[DS Alert Error] Failed to ping DS WhatsApp:', alertErr.message);
      }
    })();

    res.json({
      success: true,
      message: 'ලිපිය ප්‍රාදේශීය ලේකම්තුමාගේ අනුමැතිය සහ E-Signature සඳහා සාර්ථකව යොමු කරන ලදී! (Submitted for DS Approval)',
      approvalId: approvalRequest.id,
      verificationCode
    });
  } catch (err) {
    console.error('Error submitting approval request:', err);
    res.status(500).json({ error: 'Failed to submit approval request: ' + err.message });
  }
});

// 2. Get Approvals List (Admin sees all; Sections see their own)
app.get('/api/approvals', requireAuth, (req, res) => {
  const approvals = readJSON(APPROVALS_FILE, []);
  const { status, section, q } = req.query;

  let result = approvals;

  if (req.user.role === 'admin') {
    if (section && section !== 'all') {
      result = result.filter(a => a.requestedBy && (a.requestedBy.username === section || a.requestedBy.role === section));
    }
  } else {
    // Non-admin sections only see their own requests
    result = result.filter(a => a.requestedBy && a.requestedBy.username === req.user.username);
  }

  if (status && status !== 'all') {
    result = result.filter(a => a.status === status);
  }

  if (q) {
    const query = q.toLowerCase().trim();
    result = result.filter(a =>
      (a.verificationCode && a.verificationCode.toLowerCase().includes(query)) ||
      (a.message && a.message.toLowerCase().includes(query)) ||
      (a.requestedBy && a.requestedBy.name && a.requestedBy.name.toLowerCase().includes(query)) ||
      (a.recipient && a.recipient.name && a.recipient.name.toLowerCase().includes(query)) ||
      (a.recipient && a.recipient.phone && a.recipient.phone.includes(query))
    );
  }

  res.json(result);
});

// 3. Count Pending Approvals
app.get('/api/approvals/count-pending', requireAuth, (req, res) => {
  const approvals = readJSON(APPROVALS_FILE, []);
  let pendingList = approvals.filter(a => a.status === 'pending');
  if (req.user.role !== 'admin') {
    pendingList = pendingList.filter(a => a.requestedBy && a.requestedBy.username === req.user.username);
  }
  res.json({ pendingCount: pendingList.length });
});

// 4. Approve & E-Sign & Dispatch WhatsApp (Admin Only)
app.post('/api/approvals/:id/approve', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Only Divisional Secretary (Admin) can approve and sign documents.' });
  }

  const approvals = readJSON(APPROVALS_FILE, []);
  const index = approvals.findIndex(a => a.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Approval request not found.' });
  }

  const approval = approvals[index];
  if (approval.status !== 'pending') {
    return res.status(400).json({ error: `This request is already marked as ${approval.status}.` });
  }

  const hasRecipient = (approval.isBulk && Array.isArray(approval.recipients) && approval.recipients.length > 0) || (approval.recipient && approval.recipient.phone);

  if (hasRecipient && (whatsappStatus !== 'ready' || !sock)) {
    return res.status(503).json({ error: 'WhatsApp is not connected! Please connect WhatsApp to dispatch approved messages to recipients.' });
  }

  try {
    const approvalDate = new Date();
    const approvalDateStr = approvalDate.toLocaleDateString('si-LK') + ' ' + approvalDate.toLocaleTimeString('si-LK');

    // Process & Stamp Attachments (If PDF, stamp DS signature and seal)
    const finalAttachments = [];
    const signedFilesMeta = [];

    if (approval.attachments && Array.isArray(approval.attachments)) {
      for (const att of approval.attachments) {
        let filePath = att.path;
        if (!filePath || !fs.existsSync(filePath)) {
          if (att.filename) filePath = path.join(uploadsDir, att.filename);
        }

        const ext = path.extname(att.originalname || att.filename || '').toLowerCase();
        const isPdf = att.mimetype === 'application/pdf' || ext === '.pdf';

        if (isPdf && filePath && fs.existsSync(filePath)) {
          console.log(`[E-Signature] Stamping PDF for approval ${approval.verificationCode}...`);
          const customPos = req.body && req.body.customPos ? req.body.customPos : null;
          const stampedPath = await stampPdfWithDsSignature(filePath, approval.verificationCode, approvalDateStr, customPos, req);
          const stampedFilename = path.basename(stampedPath);
          finalAttachments.push({
            path: stampedPath,
            filename: stampedFilename,
            originalname: `Signed_${att.originalname || 'document.pdf'}`,
            mimetype: 'application/pdf'
          });
          signedFilesMeta.push({
            originalName: att.originalname,
            signedFilename: stampedFilename,
            url: `/uploads/${stampedFilename}`
          });
        } else {
          finalAttachments.push(att);
        }
      }
    }

    // Build official e-signature note into message
    const eSignNote = `\n\n━━━━━━━━━━━━━━━━━━━━\n✍️ *නිල ඩිජිටල් අනුමැතිය (Official E-Approval):*\n*අයි.ජී.අයි.ටී. රත්නායක,*\nප්‍රාදේශීය ලේකම්, බණ්ඩාරවෙල.\n*(Divisional Secretary - Bandarawela)*\n*අනුමැති අංකය (Ref):* ${approval.verificationCode}\n*අනුමත කළ දිනය:* ${approvalDateStr}\n━━━━━━━━━━━━━━━━━━━━`;

    let finalMessage = approval.message || '';
    if (!finalMessage.includes('නිල ඩිජිටල් අනුමැතිය')) {
      finalMessage = `${finalMessage}${eSignNote}`;
    }

    // Dispatch via Baileys WhatsApp
    const history = readJSON(HISTORY_FILE, []);
    let sentCount = 0;

    if (approval.isBulk && Array.isArray(approval.recipients)) {
      for (const r of approval.recipients) {
        const jid = await resolveJid(r.phone);
        if (jid) {
          try {
            await sendBaileysMessageWithAttachments(jid, finalMessage, finalAttachments);
            history.unshift({
              id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              officerId: r.id || '',
              officerName: r.name || 'Recipient',
              phone: r.phone,
              message: finalMessage,
              attachment: finalAttachments.length > 0 ? (finalAttachments[0].filename || '') : null,
              attachmentsCount: finalAttachments.length,
              status: 'sent',
              timestamp: new Date().toISOString(),
              sentBy: {
                id: approval.requestedBy.id,
                username: approval.requestedBy.username,
                name: `${approval.requestedBy.name} (Approved & E-Signed by DS)`,
                role: approval.requestedBy.role
              }
            });
            sentCount++;
          } catch (sendErr) {
            console.error(`Failed to dispatch approved message to ${r.phone}:`, sendErr);
          }
          await delay(1200);
        }
      }
    } else if (approval.recipient) {
      const r = approval.recipient;
      const jid = await resolveJid(r.phone);
      if (!jid) {
        return res.status(400).json({ error: `Could not resolve WhatsApp number: ${r.phone}` });
      }
      await sendBaileysMessageWithAttachments(jid, finalMessage, finalAttachments);
      history.unshift({
        id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        officerId: r.id || '',
        officerName: r.name || 'Recipient',
        phone: r.phone,
        message: finalMessage,
        attachment: finalAttachments.length > 0 ? (finalAttachments[0].filename || '') : null,
        attachmentsCount: finalAttachments.length,
        status: 'sent',
        timestamp: new Date().toISOString(),
        sentBy: {
          id: approval.requestedBy.id,
          username: approval.requestedBy.username,
          name: `${approval.requestedBy.name} (Approved & E-Signed by DS)`,
          role: approval.requestedBy.role
        }
      });
      sentCount = 1;
    }

    writeJSON(HISTORY_FILE, history);

    // Update approval record
    approval.status = 'approved';
    if (req.body && req.body.customPos) approval.customPos = req.body.customPos;
    approval.reviewedAt = approvalDate.toISOString();
    approval.reviewedBy = {
      username: req.user.username,
      name: req.user.name || 'Divisional Secretary'
    };
    approval.signedFiles = signedFilesMeta;
    approval.finalMessage = finalMessage;

    writeJSON(APPROVALS_FILE, approvals);

    console.log(`[Approval Complete] Approved ${approval.verificationCode} by ${req.user.name} (hasRecipient: ${!!hasRecipient})`);
    const successMsg = hasRecipient
      ? `ලිපිය සාර්ථකව අනුමත කර ඩිජිටල් අත්සන (E-Signature) තබා WhatsApp හරහා යවන ලදී! (Dispatched to ${sentCount} recipient(s))`
      : `ලිපිය සාර්ථකව අනුමත කර නිල ඩිජිටල් අත්සන (E-Signature) සහ මුද්‍රාව තබන ලදී! (Approved & Signed for Section)`;

    res.json({
      success: true,
      message: successMsg,
      verificationCode: approval.verificationCode,
      signedFiles: signedFilesMeta
    });
  } catch (err) {
    console.error('Error approving and dispatching:', err);
    res.status(500).json({ error: 'Approval dispatch failed: ' + err.message });
  }
});

// 5. Reject Approval Request (Admin Only)
app.post('/api/approvals/:id/reject', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Only Divisional Secretary (Admin) can review approval requests.' });
  }

  const approvals = readJSON(APPROVALS_FILE, []);
  const approval = approvals.find(a => a.id === req.params.id);

  if (!approval) {
    return res.status(404).json({ error: 'Approval request not found.' });
  }

  const remarks = (req.body.remarks || '').trim();
  if (!remarks) {
    return res.status(400).json({ error: 'Please enter remarks explaining why revision is required.' });
  }

  approval.status = 'rejected';
  approval.rejectionRemarks = remarks;
  approval.reviewedAt = new Date().toISOString();
  approval.reviewedBy = {
    username: req.user.username,
    name: req.user.name || 'Divisional Secretary'
  };

  writeJSON(APPROVALS_FILE, approvals);
  console.log(`[Approval Rejected] ${approval.verificationCode} rejected by ${req.user.name}: "${remarks}"`);

  res.json({
    success: true,
    message: 'ලිපිය සංශෝධන සටහනක් සහිතව අදාළ අංශයට හරවා යවන ලදී. (Returned with remarks)'
  });
});

// 6. Delete / Cancel Approval Request
app.delete('/api/approvals/:id', requireAuth, (req, res) => {
  let approvals = readJSON(APPROVALS_FILE, []);
  const index = approvals.findIndex(a => a.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Approval request not found.' });
  }

  const approval = approvals[index];
  const isOwner = approval.requestedBy && approval.requestedBy.username === req.user.username;
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'Access denied. You can only delete your own approval requests.' });
  }

  approvals.splice(index, 1);
  writeJSON(APPROVALS_FILE, approvals);

  res.json({ success: true, message: 'Approval record removed.' });
});

// --- SETTINGS API ---
app.get('/api/settings', requireAuth, (req, res) => {
  const settings = readJSON(SETTINGS_FILE, { dsPhone: '0714435277', enableDsAlerts: true, publicVerifyUrl: '' });
  const lanIp = getLocalNetworkIp();
  res.json({
    ...settings,
    lanIp,
    detectedBaseUrl: `http://${lanIp}:${PORT}`
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Only Divisional Secretary (Admin) can update alert settings.' });
  }
  const { dsPhone, enableDsAlerts, publicVerifyUrl } = req.body;
  const settings = readJSON(SETTINGS_FILE, { dsPhone: '0714435277', enableDsAlerts: true, publicVerifyUrl: '' });
  if (dsPhone !== undefined) settings.dsPhone = String(dsPhone).trim();
  if (enableDsAlerts !== undefined) settings.enableDsAlerts = Boolean(enableDsAlerts);
  if (publicVerifyUrl !== undefined) settings.publicVerifyUrl = String(publicVerifyUrl).trim();
  writeJSON(SETTINGS_FILE, settings);
  console.log(`[Settings] Updated: Phone=${settings.dsPhone}, Alerts=${settings.enableDsAlerts}, PublicVerifyUrl=${settings.publicVerifyUrl}`);
  res.json({ success: true, message: 'Settings updated successfully!', settings });
});

// ==========================================
// PUBLIC DOCUMENT VERIFICATION PORTAL
// ==========================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getVerificationHtml(code, found) {
  const isFound = !!found;
  const isCodeEntered = !!code;

  let detailsHtml = '';
  if (isFound) {
    const createdDate = new Date(found.reviewedAt || found.createdAt).toLocaleString('en-GB');
    const secName = found.requestedBy ? (found.requestedBy.name || found.requestedBy.username) : 'General Administration';
    const recName = found.recipient ? `${found.recipient.name} (${found.recipient.phone})` : (found.isBulk ? `කණ්ඩායම් පණිවිඩයක් (${(found.recipients || []).length} දෙනෙකු වෙත)` : 'අභ්‍යන්තර කාර්යාල ලේඛනය (Internal Document)');
    const fileNo = (found.recipient && found.recipient.fileNo) ? found.recipient.fileNo : 'නැත (N/A)';
    const signedPdfUrl = (found.signedFiles && found.signedFiles.length > 0) ? found.signedFiles[0].url : null;

    detailsHtml = `
      <div class="status-banner valid">
        <div class="status-icon"><i class="fa-solid fa-circle-check"></i></div>
        <div>
          <h2 style="margin: 0; font-size: 1.15rem; color: #166534;">නිල වශයෙන් සත්‍යාපිතයි (Officially Authenticated)</h2>
          <p style="margin: 3px 0 0 0; font-size: 0.85rem; color: #15803d;">මෙම ලේඛනය බණ්ඩාරවෙල ප්‍රාදේශීය ලේකම් කාර්යාලය මඟින් නිකුත් කරන ලද සත්‍ය රාජ්‍ය ලේඛනයකි.</p>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-row">
          <span class="info-label"><i class="fa-solid fa-barcode"></i> අනුමැති අංකය (Verification Ref):</span>
          <span class="info-val ref-badge">${escapeHtml(found.verificationCode)}</span>
        </div>
        <div class="info-row">
          <span class="info-label"><i class="fa-solid fa-building-columns"></i> නිකුත් කළ අංශය (Issuing Section):</span>
          <span class="info-val"><strong>${escapeHtml(secName)}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label"><i class="fa-solid fa-signature"></i> අනුමත කළ බලධාරියා (Approving Officer):</span>
          <span class="info-val"><strong>අයි.ජී.අයි.ටී. රත්නායක</strong><br><small style="color: #64748b;">ප්‍රාදේශීය ලේකම්, බණ්ඩාරවෙල (Divisional Secretary)</small></span>
        </div>
        <div class="info-row">
          <span class="info-label"><i class="fa-solid fa-calendar-check"></i> අනුමත කළ දිනය හා වේලාව:</span>
          <span class="info-val">${createdDate}</span>
        </div>
        <div class="info-row">
          <span class="info-label"><i class="fa-solid fa-user-check"></i> ලබන්නා (Recipient / Destination):</span>
          <span class="info-val">${escapeHtml(recName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label"><i class="fa-solid fa-folder-open"></i> අදාළ ලිපිගොනු අංකය (File No):</span>
          <span class="info-val">${escapeHtml(fileNo)}</span>
        </div>
      </div>

      <div style="margin-top: 18px;">
        <label style="font-size: 0.82rem; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;"><i class="fa-solid fa-envelope-open-text"></i> ලේඛනයේ අන්තර්ගත සාරාංශය (Subject / Excerpt):</label>
        <div class="message-box">${escapeHtml(found.message || '[ලේඛනය පමණක් අමුණා ඇත]')}</div>
      </div>

      ${signedPdfUrl ? `
        <div style="margin-top: 20px; text-align: center;">
          <a href="${signedPdfUrl}" target="_blank" class="btn-download-pdf">
            <i class="fa-solid fa-file-pdf"></i> අත්සන් කළ නිල PDF ලේඛනය බලන්න (View Official Signed PDF)
          </a>
        </div>
      ` : ''}

      <div class="disclaimer-card">
        <i class="fa-solid fa-shield-halved" style="color: #2563eb; font-size: 1.3rem;"></i>
        <div style="font-size: 0.78rem; color: #475569; line-height: 1.45;">
          <strong>ඩිජිටල් ආරක්ෂණ සටහන:</strong> මෙම ලේඛනයේ සත්‍යතාව බණ්ඩාරවෙල ප්‍රාදේශීය ලේකම් කාර්යාලීය ඩිජිටල් පද්ධතිය (E-Governance System) මඟින් සනාථ කෙරේ. මෙහි අන්තර්ගතය වෙනස් කළ නොහැකි ලෙස සුරක්ෂිතව පවතී.
        </div>
      </div>
    `;
  } else if (isCodeEntered) {
    detailsHtml = `
      <div class="status-banner invalid">
        <div class="status-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div>
          <h2 style="margin: 0; font-size: 1.1rem; color: #991b1b;">වලංගු නොවන හෝ හඳුනානොගත් ලේඛන අංකයකි</h2>
          <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #b91c1c;">"<strong>${escapeHtml(code)}</strong>" අංකය සඳහා බණ්ඩාරවෙල ප්‍රාදේශීය ලේකම් කාර්යාලීය ඩිජිටල් අනුමැති වාර්තාවක් හමු නොවීය. කරුණාකර අංකය නිවැරදිදැයි නැවත පරීක්ෂා කරන්න.</p>
        </div>
      </div>
    `;
  } else {
    detailsHtml = `
      <div style="text-align: center; padding: 25px 15px; color: #64748b;">
        <i class="fa-solid fa-qrcode" style="font-size: 3rem; color: #94a3b8; margin-bottom: 12px; display: block;"></i>
        <p style="margin: 0; font-size: 0.95rem;">ප්‍රාදේශීය ලේකම් කාර්යාලය මඟින් නිකුත් කළ ලිපියේ හෝ PDF එකේ ඇති <b>QR කේතය Scan කරන්න</b>, නැතහොත් අනුමැති අංකය (Ref Number) ඉහත සටහන් කර සත්‍යාපනය කරන්න.</p>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="si">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>රාජ්‍ය ඩිජිටල් ලේඛන සත්‍යාපනය | Divisional Secretariat Bandarawela</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 20px 15px;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #f1f5f9; color: #1e293b;
      min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    }
    .gov-flag-bar {
      position: fixed; top: 0; left: 0; right: 0; height: 5px;
      background: linear-gradient(90deg, #8d1b3d 0%, #8d1b3d 35%, #ffbe29 35%, #ffbe29 55%, #005f43 55%, #005f43 75%, #df742c 75%, #df742c 100%);
      z-index: 100;
    }
    .main-card {
      background: #ffffff; width: 100%; max-width: 660px;
      border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0; overflow: hidden; margin-top: 15px;
    }
    .card-header {
      background: #0f172a; color: #ffffff; padding: 22px 20px; text-align: center;
      border-bottom: 3px solid #2563eb;
    }
    .card-body { padding: 24px 22px; }
    .search-box {
      display: flex; gap: 8px; margin-bottom: 20px;
    }
    .search-input {
      flex: 1; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;
      font-size: 0.95rem; font-family: monospace; font-weight: 600;
      text-transform: uppercase;
    }
    .search-input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
    .search-btn {
      background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 8px;
      font-weight: 600; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 6px;
    }
    .search-btn:hover { background: #1d4ed8; }
    .status-banner {
      display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 8px; margin-bottom: 18px;
    }
    .status-banner.valid { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .status-banner.invalid { background: #fef2f2; border: 1px solid #fecaca; }
    .status-icon { font-size: 1.8rem; }
    .status-banner.valid .status-icon { color: #16a34a; }
    .status-banner.invalid .status-icon { color: #dc2626; }
    .info-grid {
      display: flex; flex-direction: column; gap: 10px; background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;
    }
    .info-row {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; font-size: 0.88rem;
      border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px;
    }
    .info-row:last-child { border-bottom: none; padding-bottom: 0; }
    .info-label { color: #64748b; font-weight: 600; min-width: 170px; display: flex; align-items: center; gap: 6px; }
    .info-val { color: #0f172a; text-align: right; }
    .ref-badge { font-family: monospace; font-weight: 700; background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 4px; border: 1px solid #bfdbfe; font-size: 0.95rem; }
    .message-box {
      background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb;
      padding: 12px; border-radius: 6px; font-size: 0.86rem; color: #334155; line-height: 1.5;
    }
    .btn-download-pdf {
      display: inline-flex; align-items: center; gap: 8px; background: #16a34a; color: #ffffff;
      padding: 11px 22px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 0.92rem;
      box-shadow: 0 4px 12px rgba(22,163,74,0.3); transition: all 0.2s;
    }
    .btn-download-pdf:hover { background: #15803d; transform: translateY(-1px); }
    .disclaimer-card {
      margin-top: 22px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      padding: 12px 14px; display: flex; gap: 10px; align-items: center;
    }
    .card-footer {
      background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 20px; text-align: center;
      font-size: 0.76rem; color: #64748b;
    }
  </style>
</head>
<body>
  <div class="gov-flag-bar"></div>

  <div class="main-card">
    <div class="card-header">
      <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: #cbd5e1; margin-bottom: 4px;">ශ්‍රී ලංකා ප්‍රජාතාන්ත්‍රික සමාජවාදී ජනරජය</div>
      <h1 style="margin: 0; font-size: 1.25rem; font-weight: 700;">ප්‍රාදේශීය ලේකම් කාර්යාලය - බණ්ඩාරවෙල</h1>
      <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 2px;">Divisional Secretariat - Bandarawela</div>
      <div style="display: inline-block; margin-top: 10px; background: rgba(37,99,235,0.25); border: 1px solid #3b82f6; color: #93c5fd; padding: 3px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
        <i class="fa-solid fa-certificate"></i> නිල ඩිජිටල් ලේඛන සත්‍යාපන ද්වාරය (Document Verification Portal)
      </div>
    </div>

    <div class="card-body">
      <form action="/verify" method="GET" class="search-box">
        <input type="text" name="code" class="search-input" placeholder="BDS-2026-APP-xxxx" value="${escapeHtml(code || '')}" required>
        <button type="submit" class="search-btn"><i class="fa-solid fa-magnifying-glass"></i> සත්‍යාපනය</button>
      </form>

      ${detailsHtml}
    </div>

    <div class="card-footer">
      <div>🏛️ බණ්ඩාරවෙල ප්‍රාදේශීය ලේකම් කාර්යාලය • දුරකථන: 057-2222235 • ඊමේල්: dsbandarawela@gmail.com</div>
      <div style="margin-top: 6px; font-weight: 700; color: #1e293b; font-size: 0.85rem; letter-spacing: 0.5px;">
        <i class="fa-solid fa-laptop-code" style="color: #2563eb;"></i> IT Unit BW DS @2026
      </div>
      <div style="margin-top: 6px;">
        <a href="https://bandarawela-staff-directory.vercel.app/" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
          <i class="fa-solid fa-users"></i> Online Staff Directory Portal <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.65rem;"></i>
        </a>
      </div>
      <div style="margin-top: 4px; color: #94a3b8; font-size: 0.72rem;">National Productivity & E-Governance Document Authentication System</div>
    </div>
  </div>
</body>
</html>`;
}

// Verification Web Routes
app.get(['/verify', '/verify/:code'], (req, res) => {
  const code = (req.params.code || req.query.code || '').trim().toUpperCase();
  const approvals = readJSON(APPROVALS_FILE, []);
  let found = null;
  if (code) {
    found = approvals.find(a => a.verificationCode && a.verificationCode.toUpperCase() === code);
  }

  const html = getVerificationHtml(code, found);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Verification API Endpoint
app.get('/api/verify/:code', (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const approvals = readJSON(APPROVALS_FILE, []);
  const found = approvals.find(a => a.verificationCode && a.verificationCode.toUpperCase() === code);
  if (!found) {
    return res.status(404).json({ valid: false, error: 'Document not found or invalid reference number.' });
  }
  res.json({
    valid: true,
    verificationCode: found.verificationCode,
    status: found.status,
    createdAt: found.createdAt,
    reviewedAt: found.reviewedAt,
    requestedBy: found.requestedBy,
    recipient: found.recipient,
    signedFiles: found.signedFiles
  });
});

// ==========================================
// BACKUP & RESTORE API ROUTES (Admin Only)
// ==========================================

// 1. Download Backup JSON File
app.get('/api/backup/download', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }

  const snapshot = {
    appName: 'Divisional Secretariat Bandarawela - Office WhatsApp & E-Sign System',
    version: '1.0',
    label: 'manual_export',
    timestamp: new Date().toISOString(),
    data: {
      officers: readJSON(OFFICERS_FILE, []),
      customers: readJSON(CUSTOMERS_FILE, []),
      history: readJSON(HISTORY_FILE, []),
      users: readJSON(USERS_FILE, []),
      approvals: readJSON(APPROVALS_FILE, []),
      scheduled: readJSON(SCHEDULED_FILE, []),
      settings: readJSON(SETTINGS_FILE, {})
    }
  };

  const filename = `ds_bandarawela_backup_${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(snapshot, null, 2));
});

// 2. List Local Snapshots
app.get('/api/backup/snapshots', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(filename => {
        const filePath = path.join(backupsDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          createdAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Create Manual Snapshot Now
app.post('/api/backup/snapshot', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const result = createSystemSnapshot('manual');
  if (result) {
    res.json({ success: true, message: 'නව Safety Snapshot එකක් සාර්ථකව සාදන ලදී!', filename: result.filename });
  } else {
    res.status(500).json({ error: 'Snapshot එක සෑදීම අසාර්ථක විය.' });
  }
});

// 4. Restore from Local Snapshot
app.post('/api/backup/restore-snapshot', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const { filename } = req.body;
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid snapshot filename.' });
  }

  const targetPath = path.join(backupsDir, filename);
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Snapshot file not found.' });
  }

  try {
    const content = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    const d = content.data || content;

    if (!d) {
      return res.status(400).json({ error: 'Invalid backup file content.' });
    }

    // Safety snapshot before restoring
    createSystemSnapshot('before_restore');

    if (Array.isArray(d.officers)) writeJSON(OFFICERS_FILE, d.officers);
    if (Array.isArray(d.customers)) writeJSON(CUSTOMERS_FILE, d.customers);
    if (Array.isArray(d.history)) writeJSON(HISTORY_FILE, d.history);
    if (Array.isArray(d.users)) writeJSON(USERS_FILE, d.users);
    if (Array.isArray(d.approvals)) writeJSON(APPROVALS_FILE, d.approvals);
    if (Array.isArray(d.scheduled)) writeJSON(SCHEDULED_FILE, d.scheduled);
    if (d.settings && typeof d.settings === 'object') writeJSON(SETTINGS_FILE, d.settings);

    res.json({ success: true, message: 'Snapshot එක සාර්ථකව ප්‍රතිස්ථාපනය (Restore) කරන ලදී!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore snapshot: ' + err.message });
  }
});

// 5. Restore from Uploaded JSON File
app.post('/api/backup/restore-file', requireAuth, upload.single('backupFile'), (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a backup JSON file.' });
  }

  try {
    const raw = fs.readFileSync(req.file.path, 'utf8');
    const content = JSON.parse(raw);
    const d = content.data || content;

    if (!d || (!Array.isArray(d.users) && !Array.isArray(d.officers) && !Array.isArray(d.customers))) {
      return res.status(400).json({ error: 'Invalid backup file format. Expected system data structure.' });
    }

    // Safety snapshot before restoring
    createSystemSnapshot('before_restore_upload');

    if (Array.isArray(d.officers)) writeJSON(OFFICERS_FILE, d.officers);
    if (Array.isArray(d.customers)) writeJSON(CUSTOMERS_FILE, d.customers);
    if (Array.isArray(d.history)) writeJSON(HISTORY_FILE, d.history);
    if (Array.isArray(d.users)) writeJSON(USERS_FILE, d.users);
    if (Array.isArray(d.approvals)) writeJSON(APPROVALS_FILE, d.approvals);
    if (Array.isArray(d.scheduled)) writeJSON(SCHEDULED_FILE, d.scheduled);
    if (d.settings && typeof d.settings === 'object') writeJSON(SETTINGS_FILE, d.settings);

    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch(e) {}

    res.json({ success: true, message: 'Backup ගොනුව සාර්ථකව ප්‍රතිස්ථාපනය (Restore) කරන ලදී!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore backup file: ' + err.message });
  }
});

// Start Express Server with EADDRINUSE graceful fallback
const server = app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`Office WhatsApp Sender App (Baileys Engine) running at:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`===================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const fallbackPort = PORT + 1;
    console.warn(`[WARNING] Port ${PORT} is occupied. Starting on fallback port ${fallbackPort}...`);
    app.listen(fallbackPort, () => {
      console.log(`===================================================`);
      console.log(`Office WhatsApp Sender App running on fallback port:`);
      console.log(`http://localhost:${fallbackPort}`);
      console.log(`===================================================`);
    });
  } else {
    console.error('Server listen error:', err);
  }
});

// Keep-Alive Self Ping (Prevents Render Free Tier from Sleeping)
setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    fetch(`${renderUrl}/api/status`)
      .then(() => console.log('Self-ping success: Server kept awake.'))
      .catch(() => {});
  }
}, 8 * 60 * 1000);

// Global Error Guards (Prevents server crash on socket disconnects/timeouts)
process.on('uncaughtException', (err) => {
  console.error('Handled Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Handled Unhandled Rejection:', reason && reason.message ? reason.message : reason);
});
