const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
// --- E-SIGNATURE & DS APPROVAL PIPELINE ---
// ==========================================

async function stampPdfWithDsSignature(inputPdfPath, verificationCode, approvalDateStr) {
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

    // Official dimensions (aspect ratio preserved, width: 165 pt, height: ~98 pt)
    const sigWidth = 165;
    const sigHeight = (sigImage.height / sigImage.width) * sigWidth;

    // Place at bottom right (standard government letter signature area)
    const sigX = Math.max(30, width - sigWidth - 40);
    const sigY = 55;

    lastPage.drawImage(sigImage, {
      x: sigX,
      y: sigY,
      width: sigWidth,
      height: sigHeight
    });

    // Verification metadata texts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const refText = `Verified Digital Approval | Ref: ${verificationCode || 'BDS-APP'}`;
    const dateText = `Date: ${approvalDateStr || new Date().toLocaleString('en-GB')}`;

    lastPage.drawText(refText, {
      x: sigX,
      y: sigY - 10,
      size: 6.5,
      font: helveticaBold,
      color: rgb(0.12, 0.28, 0.55)
    });

    lastPage.drawText(dateText, {
      x: sigX,
      y: sigY - 18,
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
    console.log(`[E-Signature] Successfully stamped PDF: ${signedFileName}`);
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
      singleRecipient = {
        id: req.body.officerId || '',
        name: req.body.recipientName || 'Recipient',
        phone: req.body.phone || '',
        fileNo: req.body.fileNo || ''
      };
      if (!singleRecipient.phone) {
        return res.status(400).json({ error: 'Recipient phone number is required.' });
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

  if (whatsappStatus !== 'ready' || !sock) {
    return res.status(503).json({ error: 'WhatsApp is not connected! Please connect WhatsApp before approving and dispatching messages.' });
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
          const stampedPath = await stampPdfWithDsSignature(filePath, approval.verificationCode, approvalDateStr);
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
    approval.reviewedAt = approvalDate.toISOString();
    approval.reviewedBy = {
      username: req.user.username,
      name: req.user.name || 'Divisional Secretary'
    };
    approval.signedFiles = signedFilesMeta;
    approval.finalMessage = finalMessage;

    writeJSON(APPROVALS_FILE, approvals);

    console.log(`[Approval Complete] Approved & dispatched ${approval.verificationCode} by ${req.user.name}`);
    res.json({
      success: true,
      message: `ලිපිය සාර්ථකව අනුමත කර ඩිජිටල් අත්සන (E-Signature) තබා WhatsApp හරහා යවන ලදී! (Dispatched to ${sentCount} recipient(s))`,
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
