const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
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
let whatsappStatus = 'initializing'; // initializing, qr, authenticated, ready, disconnected
let qrCodeDataURL = null;
let clientInfo = null;

async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Bandarawela DS WhatsApp', 'Chrome', '1.0.0'],
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      syncFullHistory: false,
      retryRequestDelayMs: 250
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('New WhatsApp QR Code generated for Baileys.');
        whatsappStatus = 'qr';
        QRCode.toDataURL(qr, (err, url) => {
          if (!err) qrCodeDataURL = url;
        });
      }

      if (connection === 'open') {
        console.log('===================================================');
        console.log('WhatsApp connection OPEN & READY (Baileys Engine)!');
        console.log('===================================================');
        whatsappStatus = 'ready';
        qrCodeDataURL = null;
        const rawUser = sock.user ? sock.user.id.split(':')[0] : 'Office Number';
        clientInfo = { wid: rawUser };
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`WhatsApp connection closed. Code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        whatsappStatus = 'disconnected';
        qrCodeDataURL = null;
        clientInfo = null;

        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 3000);
        } else {
          console.log('Logged out. Cleaning auth state...');
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch (e) {}
          setTimeout(connectToWhatsApp, 3000);
        }
      }
    });
  } catch (err) {
    console.error('Failed to connect to Baileys WhatsApp engine:', err);
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

// Start Express Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`Office WhatsApp Sender App (Baileys Engine) running at:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`===================================================`);
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
