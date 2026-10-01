document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const statusTitle = document.getElementById('statusTitle');
  const statusSub = document.getElementById('statusSub');
  const logoutBtn = document.getElementById('logoutBtn');
  const qrBanner = document.getElementById('qrBanner');
  const qrCodeImg = document.getElementById('qrCodeImg');

  const tabOfficersBtn = document.getElementById('tabOfficersBtn');
  const tabCustomersBtn = document.getElementById('tabCustomersBtn');
  const dirPanelTitle = document.getElementById('dirPanelTitle');
  const searchInput = document.getElementById('searchInput');
  const officersList = document.getElementById('officersList');
  const openAddModalBtn = document.getElementById('openAddModalBtn');

  const selectedOfficerBanner = document.getElementById('selectedOfficerBanner');
  const selAvatar = document.getElementById('selAvatar');
  const selName = document.getElementById('selName');
  const selDesignation = document.getElementById('selDesignation');
  const selPhone = document.getElementById('selPhone');
  const selectedOfficerId = document.getElementById('selectedOfficerId');
  const selectedPhone = document.getElementById('selectedPhone');

  const messageForm = document.getElementById('messageForm');
  const messageText = document.getElementById('messageText');
  const imageUpload = document.getElementById('imageUpload');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const uploadPreview = document.getElementById('uploadPreview');
  const previewImg = document.getElementById('previewImg');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const sendBtn = document.getElementById('sendBtn');
  const historyList = document.getElementById('historyList');

  // Officers Modal Elements
  const officerModal = document.getElementById('officerModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  const officerForm = document.getElementById('officerForm');
  const modalTitle = document.getElementById('modalTitle');

  // Customer File Modal Elements
  const customerModal = document.getElementById('customerModal');
  const closeCustModalBtn = document.getElementById('closeCustModalBtn');
  const cancelCustModalBtn = document.getElementById('cancelCustModalBtn');
  const customerForm = document.getElementById('customerForm');
  const custModalTitle = document.getElementById('custModalTitle');

  // Auth & Security DOM Elements
  const loginOverlay = document.getElementById('loginOverlay');
  const loginForm = document.getElementById('loginForm');
  const loginUsername = document.getElementById('loginUsername');
  const loginPassword = document.getElementById('loginPassword');
  const userBadge = document.getElementById('userBadge');
  const userName = document.getElementById('userName');
  const userLogoutBtn = document.getElementById('userLogoutBtn');
  const openChangePassBtn = document.getElementById('openChangePassBtn');
  const changePasswordModal = document.getElementById('changePasswordModal');
  const closePassModalBtn = document.getElementById('closePassModalBtn');
  const cancelPassModalBtn = document.getElementById('cancelPassModalBtn');
  const changePasswordForm = document.getElementById('changePasswordForm');

  const toast = document.getElementById('toast');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const selectedCountBadge = document.getElementById('selectedCountBadge');

  let activeTab = 'officers'; // 'officers' or 'customers'
  let activeRecipient = null; // selected officer, customer object or bulk object
  let isWhatsAppReady = false;
  let authToken = localStorage.getItem('ds_auth_token') || null;
  let selectedMap = new Map(); // stores selected id -> item object
  let currentDirectoryItems = []; // currently rendered items in active tab

  // --- Helper: Authenticated Fetch ---
  async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
    const response = await fetch(url, options);
    if (response.status === 401) {
      logoutUser();
    }
    return response;
  }

  // --- Auth Check on Startup ---
  async function checkSession() {
    if (!authToken) {
      showLoginScreen();
      return;
    }
    try {
      const res = await authFetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        hideLoginScreen(data.user);
        loadDirectory();
        loadHistory();
      } else {
        logoutUser();
      }
    } catch (err) {
      console.error('Auth check error:', err);
    }
  }

  function showLoginScreen() {
    loginOverlay.classList.add('active');
    userBadge.style.display = 'none';
    if (loginUsername) loginUsername.value = '';
    if (loginPassword) loginPassword.value = '';
  }

  function logoutUser() {
    authToken = null;
    localStorage.removeItem('ds_auth_token');
    showLoginScreen();
  }

  if (userLogoutBtn) {
    userLogoutBtn.addEventListener('click', () => {
      logoutUser();
      showToast('Logged out. Please enter username and password to log in.', 'info');
    });
  }

  // Robust Login Handler
  let isLoggingIn = false;
  async function doLogin(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isLoggingIn) return false;

    const username = (loginUsername.value || '').trim();
    const password = (loginPassword.value || '').trim();

    if (!username || !password) {
      showToast('Please enter both Username and Password.', 'error');
      return false;
    }

    isLoggingIn = true;
    const submitBtn = document.getElementById('loginSubmitBtn');
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Logging in...`;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        authToken = data.token;
        localStorage.setItem('ds_auth_token', authToken);
        hideLoginScreen(data.user);
        showToast(`Welcome, ${data.user.name}!`, 'success');
        loginPassword.value = '';
        loadDirectory();
        loadHistory();
      } else {
        showToast(data.error || 'Invalid Username or Password.', 'error');
      }
    } catch (err) {
      console.error('Login error:', err);
      showToast('Connection error logging in.', 'error');
    } finally {
      isLoggingIn = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Access Dispatcher`;
    }
    return false;
  }

  // Event Listeners for Login
  loginForm.addEventListener('submit', doLogin);
  document.getElementById('loginSubmitBtn').addEventListener('click', doLogin);
  loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doLogin(e);
    }
  });

  function switchToOfficerTab() {
    activeTab = 'officers';
    selectedMap.clear();
    tabOfficersBtn.classList.add('active');
    tabCustomersBtn.classList.remove('active');
    dirPanelTitle.innerHTML = `<i class="fa-solid fa-address-book"></i> Officers Directory`;
    openAddModalBtn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Add Officer`;
    searchInput.placeholder = `Search officer by name, designation or department...`;
    updateSelectionUI();
    loadDirectory();
  }

  function switchToCustomerTab() {
    activeTab = 'customers';
    selectedMap.clear();
    tabCustomersBtn.classList.add('active');
    tabOfficersBtn.classList.remove('active');
    dirPanelTitle.innerHTML = `<i class="fa-solid fa-folder-open"></i> Land Customer Files (ඉඩම් ලේඛනය)`;
    openAddModalBtn.innerHTML = `<i class="fa-solid fa-folder-plus"></i> Add Customer File`;
    searchInput.placeholder = `Search by Customer Name, File No, NIC No or Address...`;
    updateSelectionUI();
    loadDirectory();
  }

  let currentUser = null;

  function hideLoginScreen(user) {
    currentUser = user;
    loginOverlay.classList.remove('active');
    if (user) {
      userName.textContent = user.name || 'User Portal';
      userBadge.style.display = 'inline-flex';

      if (clearHistoryBtn) {
        clearHistoryBtn.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
      }

      // Automatically default Land Section & Clerks to Land Customer Files!
      if (user.role === 'land_section' || user.role === 'clerk') {
        switchToCustomerTab();
      } else {
        switchToOfficerTab();
      }
    }
  }

  // --- Directory Switcher Tabs ---
  tabOfficersBtn.addEventListener('click', switchToOfficerTab);
  tabCustomersBtn.addEventListener('click', switchToCustomerTab);

  // Add Button Click Router
  openAddModalBtn.addEventListener('click', () => {
    if (activeTab === 'officers') {
      modalTitle.innerHTML = `<i class="fa-solid fa-user-plus"></i> Add New Officer`;
      officerForm.reset();
      document.getElementById('officerIdInput').value = '';
      officerModal.classList.add('active');
    } else {
      custModalTitle.innerHTML = `<i class="fa-solid fa-folder-plus"></i> Add New Customer File`;
      customerForm.reset();
      document.getElementById('customerIdInput').value = '';
      customerModal.classList.add('active');
    }
  });

  // --- 1. WhatsApp Connection Polling ---
  async function checkWhatsAppStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (data.status === 'ready') {
        isWhatsAppReady = true;
        statusDot.className = 'status-indicator-dot online';
        statusTitle.textContent = 'WhatsApp Connected';
        statusSub.textContent = data.info ? `Online as +${data.info.wid}` : 'Ready to send messages';
        qrBanner.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        updateSendButtonState();
      } else if (data.status === 'qr' && data.qrCode) {
        isWhatsAppReady = false;
        statusDot.className = 'status-indicator-dot warning';
        statusTitle.textContent = 'Scan QR Code';
        statusSub.textContent = 'Link office WhatsApp phone';
        qrCodeImg.src = data.qrCode;
        qrBanner.style.display = 'block';
        logoutBtn.style.display = 'none';
        updateSendButtonState();
      } else if (data.status === 'authenticated') {
        isWhatsAppReady = false;
        statusDot.className = 'status-indicator-dot warning';
        statusTitle.textContent = 'Authenticating...';
        statusSub.textContent = 'Loading chats and session';
        qrBanner.style.display = 'none';
        logoutBtn.style.display = 'none';
        updateSendButtonState();
      } else {
        isWhatsAppReady = false;
        statusDot.className = 'status-indicator-dot';
        statusTitle.textContent = 'Disconnected';
        statusSub.textContent = 'Initializing WhatsApp...';
        qrBanner.style.display = 'none';
        logoutBtn.style.display = 'none';
        updateSendButtonState();
      }
    } catch (err) {
      console.error('Status check error:', err);
    }
  }

  setInterval(checkWhatsAppStatus, 3000);
  checkWhatsAppStatus();

  logoutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to disconnect this WhatsApp session?')) {
      await authFetch('/api/logout', { method: 'POST' });
      checkWhatsAppStatus();
      showToast('WhatsApp session disconnected.', 'info');
    }
  });

  // --- 2. Directory Loader (Officers or Customers) ---
  function syncCardCheckboxes() {
    document.querySelectorAll('.card-select-checkbox').forEach(chk => {
      const id = chk.getAttribute('data-id');
      chk.checked = selectedMap.has(id);
    });
    document.querySelectorAll('.officer-card').forEach(card => {
      const id = card.getAttribute('data-id');
      card.classList.toggle('active', selectedMap.has(id));
    });
  }

  function updateSelectionUI() {
    const count = selectedMap.size;

    if (count === 0) {
      if (selectedCountBadge) selectedCountBadge.style.display = 'none';
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      }
      resetSelectedRecipient();
    } else if (count === 1) {
      if (selectedCountBadge) {
        selectedCountBadge.style.display = 'inline-block';
        selectedCountBadge.textContent = '1 Selected';
      }
      const singleItem = Array.from(selectedMap.values())[0];
      displaySingleRecipientUI(singleItem);
    } else {
      if (selectedCountBadge) {
        selectedCountBadge.style.display = 'inline-block';
        selectedCountBadge.textContent = `${count} Selected`;
      }
      displayBulkRecipientUI(count);
    }

    if (selectAllCheckbox && currentDirectoryItems.length > 0) {
      const allSelected = currentDirectoryItems.every(item => selectedMap.has(item.id));
      const someSelected = currentDirectoryItems.some(item => selectedMap.has(item.id));
      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = !allSelected && someSelected;
    }

    syncCardCheckboxes();
  }

  function displaySingleRecipientUI(item) {
    activeRecipient = item;
    selectedOfficerId.value = item.id;
    selectedPhone.value = item.phone;

    if (activeTab === 'officers') {
      selAvatar.src = item.photo || '/uploads/default_avatar.svg';
      selName.textContent = item.name;
      selDesignation.textContent = `${item.designation || 'Officer'} • ${item.department || 'Office'}`;
      selPhone.textContent = `WhatsApp: ${item.phone}`;
    } else {
      selAvatar.src = '/uploads/default_avatar.svg';
      selName.textContent = item.name;
      selDesignation.textContent = `File No: ${item.fileNo} • NIC: ${item.idNo || 'N/A'}`;
      selPhone.textContent = `WhatsApp: ${item.phone}`;
      
      if (!messageText.value.trim()) {
        messageText.value = `Dear ${item.name}, regarding your File No: ${item.fileNo} at Bandarawela Divisional Secretariat: `;
      }
    }
    updateSendButtonState();
  }

  function displayBulkRecipientUI(count) {
    activeRecipient = { isBulk: true, count };
    selectedOfficerId.value = '';
    selectedPhone.value = '';
    selAvatar.src = '/uploads/default_avatar.svg';
    selName.textContent = `${count} Recipients Selected (තෝරාගත් ${count} දෙනෙකුට)`;
    selDesignation.textContent = `Bulk Message Mode • ${activeTab === 'officers' ? 'Officers Directory' : 'Land Customer Files'}`;
    selPhone.textContent = `Selected: ${count} Numbers`;
    updateSendButtonState();
  }

  function resetSelectedRecipient() {
    activeRecipient = null;
    selectedOfficerId.value = '';
    selectedPhone.value = '';
    selAvatar.src = '/uploads/default_avatar.svg';
    selName.textContent = 'Select a Recipient';
    selDesignation.textContent = 'Click on an officer or customer file to start messaging';
    selPhone.textContent = 'No phone selected';
    updateSendButtonState();
  }

  function updateSendButtonState() {
    const count = selectedMap.size;
    if (isWhatsAppReady && count > 0 && authToken) {
      sendBtn.removeAttribute('disabled');
      if (count > 1) {
        sendBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Send Bulk Message (${count} Recipients)`;
      } else {
        sendBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Send via Office WhatsApp`;
      }
    } else {
      sendBtn.setAttribute('disabled', 'true');
      sendBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Send via Office WhatsApp`;
    }
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      if (selectAllCheckbox.checked) {
        currentDirectoryItems.forEach(item => selectedMap.set(item.id, item));
      } else {
        currentDirectoryItems.forEach(item => selectedMap.delete(item.id));
      }
      updateSelectionUI();
    });
  }

  function loadDirectory(query = searchInput.value) {
    if (activeTab === 'officers') {
      loadOfficers(query);
    } else {
      loadCustomers(query);
    }
  }

  async function loadOfficers(query = '') {
    if (!authToken) return;
    try {
      const res = await authFetch(`/api/officers?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const officers = await res.json();
      currentDirectoryItems = officers;

      if (officers.length === 0) {
        officersList.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-muted);">
          No officers found. Click "Add Officer" to create one.
        </div>`;
        updateSelectionUI();
        return;
      }

      officersList.innerHTML = officers.map(off => `
        <div class="officer-card ${selectedMap.has(off.id) ? 'active' : ''}" data-id="${off.id}">
          <div class="officer-info-group">
            <input type="checkbox" class="card-select-checkbox" data-id="${off.id}" ${selectedMap.has(off.id) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #059669;">
            <img src="${off.photo}" class="officer-avatar" alt="${off.name}">
            <div>
              <div class="officer-name">${off.name}</div>
              <div class="officer-meta">${off.designation || 'Officer'} • ${off.department || 'General'}</div>
              <div class="badge"><i class="fa-solid fa-phone"></i> ${off.phone}</div>
            </div>
          </div>
          <div class="officer-actions">
            <button class="btn btn-icon edit-off-btn" title="Edit" data-id="${off.id}">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-icon delete-off-btn" title="Delete" data-id="${off.id}">
              <i class="fa-solid fa-trash" style="color: #ef4444;"></i>
            </button>
          </div>
        </div>
      `).join('');

      document.querySelectorAll('.card-select-checkbox').forEach(chk => {
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          const offId = chk.getAttribute('data-id');
          const item = officers.find(o => o.id === offId);
          if (item) {
            if (chk.checked) selectedMap.set(offId, item);
            else selectedMap.delete(offId);
            updateSelectionUI();
          }
        });
      });

      document.querySelectorAll('.officer-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.edit-off-btn') || e.target.closest('.delete-off-btn') || e.target.closest('.card-select-checkbox')) return;
          const offId = card.getAttribute('data-id');
          const selected = officers.find(o => o.id === offId);
          if (!selected) return;

          selectedMap.clear();
          selectedMap.set(offId, selected);
          updateSelectionUI();
        });
      });

      document.querySelectorAll('.edit-off-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const offId = btn.getAttribute('data-id');
          const selected = officers.find(o => o.id === offId);
          openEditOfficerModal(selected);
        });
      });

      document.querySelectorAll('.delete-off-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const offId = btn.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this officer?')) {
            await authFetch(`/api/officers/${offId}`, { method: 'DELETE' });
            showToast('Officer deleted successfully.', 'success');
            selectedMap.delete(offId);
            updateSelectionUI();
            loadOfficers(searchInput.value);
          }
        });
      });

      updateSelectionUI();

    } catch (err) {
      console.error('Error loading officers:', err);
    }
  }

  async function loadCustomers(query = '') {
    if (!authToken) return;
    try {
      const res = await authFetch(`/api/customers?q=${encodeURIComponent(query)}`);
      if (!res.ok) return;
      const customers = await res.json();
      currentDirectoryItems = customers;

      if (customers.length === 0) {
        officersList.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; color: var(--text-muted);">
          No customer files found. Click "Add Customer File" to create one.
        </div>`;
        updateSelectionUI();
        return;
      }

      officersList.innerHTML = customers.map(cust => `
        <div class="officer-card ${selectedMap.has(cust.id) ? 'active' : ''}" data-id="${cust.id}">
          <div class="officer-info-group">
            <input type="checkbox" class="card-select-checkbox" data-id="${cust.id}" ${selectedMap.has(cust.id) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #059669;">
            <div class="officer-avatar" style="display: flex; align-items: center; justify-content: center; background: #e0e7ff; color: #3730a3; font-size: 1.2rem; font-weight: bold;">
              <i class="fa-solid fa-folder"></i>
            </div>
            <div>
              <div class="officer-name">${cust.name}</div>
              <div class="officer-meta"><b>File No:</b> ${cust.fileNo} • <b>NIC:</b> ${cust.idNo || 'N/A'}</div>
              <div class="officer-meta" style="font-size: 0.78rem;">${cust.address ? cust.address.substring(0, 40) + '...' : ''}</div>
              <div class="badge"><i class="fa-solid fa-phone"></i> ${cust.phone}</div>
            </div>
          </div>
          <div class="officer-actions">
            <button class="btn btn-icon edit-cust-btn" title="Edit" data-id="${cust.id}">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-icon delete-cust-btn" title="Delete" data-id="${cust.id}">
              <i class="fa-solid fa-trash" style="color: #ef4444;"></i>
            </button>
          </div>
        </div>
      `).join('');

      document.querySelectorAll('.card-select-checkbox').forEach(chk => {
        chk.addEventListener('change', (e) => {
          e.stopPropagation();
          const custId = chk.getAttribute('data-id');
          const item = customers.find(c => c.id === custId);
          if (item) {
            if (chk.checked) selectedMap.set(custId, item);
            else selectedMap.delete(custId);
            updateSelectionUI();
          }
        });
      });

      document.querySelectorAll('.officer-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.edit-cust-btn') || e.target.closest('.delete-cust-btn') || e.target.closest('.card-select-checkbox')) return;
          const custId = card.getAttribute('data-id');
          const selected = customers.find(c => c.id === custId);
          if (!selected) return;

          selectedMap.clear();
          selectedMap.set(custId, selected);
          updateSelectionUI();
        });
      });

      document.querySelectorAll('.edit-cust-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const custId = btn.getAttribute('data-id');
          const selected = customers.find(c => c.id === custId);
          openEditCustomerModal(selected);
        });
      });

      document.querySelectorAll('.delete-cust-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const custId = btn.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this customer record?')) {
            await authFetch(`/api/customers/${custId}`, { method: 'DELETE' });
            showToast('Customer record deleted.', 'success');
            selectedMap.delete(custId);
            updateSelectionUI();
            loadCustomers(searchInput.value);
          }
        });
      });

      updateSelectionUI();

    } catch (err) {
      console.error('Error loading customers:', err);
    }
  }

  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      loadDirectory(e.target.value);
    }, 300);
  });

  // --- 3. Quick Message Templates ---
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const template = pill.getAttribute('data-template');
      messageText.value = template;
      messageText.focus();
    });
  });

  // --- 4. File Attachment Upload Handler ---
  imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        previewImg.src = event.target.result;
        uploadPlaceholder.style.display = 'none';
        uploadPreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  removeFileBtn.addEventListener('click', () => {
    imageUpload.value = '';
    previewImg.src = '';
    uploadPlaceholder.style.display = 'flex';
    uploadPreview.style.display = 'none';
  });

  // --- 5. Message Form Submit (Send WhatsApp) ---
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!isWhatsAppReady) {
      showToast('WhatsApp is not connected yet!', 'error');
      return;
    }

    if (selectedMap.size === 0) {
      showToast('Please select at least one recipient (officer or customer) first.', 'error');
      return;
    }

    const text = messageText.value.trim();
    const file = imageUpload.files[0];

    if (!text && !file) {
      showToast('Please enter a message or attach an image.', 'error');
      return;
    }

    const count = selectedMap.size;
    const isBulk = count > 1;

    sendBtn.setAttribute('disabled', 'true');
    sendBtn.innerHTML = isBulk
      ? `<i class="fa-solid fa-circle-notch fa-spin"></i> Dispatched bulk messages...`
      : `<i class="fa-solid fa-circle-notch fa-spin"></i> Sending via WhatsApp...`;

    try {
      let res, data;
      if (isBulk) {
        const recipientsArray = Array.from(selectedMap.values()).map(r => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          fileNo: r.fileNo || ''
        }));

        const formData = new FormData();
        formData.append('recipients', JSON.stringify(recipientsArray));
        formData.append('message', text);
        if (file) formData.append('attachment', file);

        res = await authFetch('/api/send-bulk', {
          method: 'POST',
          body: formData
        });
        data = await res.json();
      } else {
        const singleRecipient = Array.from(selectedMap.values())[0];
        const formData = new FormData();
        formData.append('officerId', singleRecipient.id);
        formData.append('phone', singleRecipient.phone);
        formData.append('message', text);
        if (file) formData.append('attachment', file);

        res = await authFetch('/api/send', {
          method: 'POST',
          body: formData
        });
        data = await res.json();
      }

      if (res.ok && data.success) {
        showToast(data.message || `Message sent successfully!`, 'success');
        messageText.value = '';
        removeFileBtn.click();
        selectedMap.clear();
        updateSelectionUI();
        loadHistory();
      } else {
        showToast(data.error || 'Failed to send WhatsApp message.', 'error');
      }
    } catch (err) {
      console.error('Send error:', err);
      showToast('Network error sending message.', 'error');
    } finally {
      updateSendButtonState();
    }
  });

  // --- 6. Message History Log ---
  async function loadHistory() {
    if (!authToken) return;
    try {
      const res = await authFetch('/api/history');
      if (!res.ok) return;
      const history = await res.json();

      if (history.length === 0) {
        historyList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">No sent messages yet.</div>`;
        return;
      }

      const isAdmin = currentUser && currentUser.role === 'admin';

      historyList.innerHTML = history.slice(0, 15).map(item => `
        <div class="history-item">
          <div>
            <strong>${item.officerName}</strong> (${item.phone})<br>
            <span style="color: var(--text-muted);">${item.message ? item.message.substring(0, 50) + '...' : '[Image attached]'}</span>
          </div>
          <div style="text-align: right; display: flex; align-items: center; gap: 8px;">
            <div>
              <span class="badge" style="background: #dcfce7; color: #15803d;"><i class="fa-solid fa-check"></i> ${item.status}</span>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            ${isAdmin ? `
              <button class="btn btn-icon delete-hist-btn" data-id="${item.id}" title="Delete Item">
                <i class="fa-solid fa-trash" style="color: #ef4444; font-size: 0.85rem;"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `).join('');

      if (isAdmin) {
        document.querySelectorAll('.delete-hist-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const histId = btn.getAttribute('data-id');
            if (confirm('Delete this history record?')) {
              await authFetch(`/api/history/${histId}`, { method: 'DELETE' });
              showToast('History record deleted.', 'success');
              loadHistory();
            }
          });
        });
      }
    } catch (err) {
      console.error('History load error:', err);
    }
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all sent message history? This action cannot be undone.')) {
        try {
          const res = await authFetch('/api/history', { method: 'DELETE' });
          const data = await res.json();
          if (res.ok && data.success) {
            showToast('Message history cleared successfully!', 'success');
            loadHistory();
          } else {
            showToast(data.error || 'Failed to clear history.', 'error');
          }
        } catch (err) {
          showToast('Error clearing history.', 'error');
        }
      }
    });
  }

  // --- 7. Modal Handlers (Officers & Customers) ---
  function openEditOfficerModal(off) {
    modalTitle.innerHTML = `<i class="fa-solid fa-user-pen"></i> Edit Officer`;
    document.getElementById('officerIdInput').value = off.id;
    document.getElementById('offName').value = off.name;
    document.getElementById('offDesignation').value = off.designation || '';
    document.getElementById('offDepartment').value = off.department || '';
    document.getElementById('offPhone').value = off.phone;
    document.getElementById('offNotes').value = off.notes || '';
    officerModal.classList.add('active');
  }

  closeModalBtn.addEventListener('click', () => officerModal.classList.remove('active'));
  cancelModalBtn.addEventListener('click', () => officerModal.classList.remove('active'));

  officerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('officerIdInput').value;
    const formData = new FormData();
    formData.append('name', document.getElementById('offName').value);
    formData.append('designation', document.getElementById('offDesignation').value);
    formData.append('department', document.getElementById('offDepartment').value);
    formData.append('phone', document.getElementById('offPhone').value);
    formData.append('notes', document.getElementById('offNotes').value);

    const photoInput = document.getElementById('offPhoto');
    if (photoInput.files[0]) {
      formData.append('photo', photoInput.files[0]);
    }

    const url = id ? `/api/officers/${id}` : '/api/officers';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await authFetch(url, { method, body: formData });
      if (res.ok) {
        showToast(id ? 'Officer updated!' : 'Officer added!', 'success');
        officerModal.classList.remove('active');
        loadOfficers(searchInput.value);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save officer.', 'error');
      }
    } catch (err) {
      showToast('Error saving officer data.', 'error');
    }
  });

  // Customer Modal Handlers
  function openEditCustomerModal(cust) {
    custModalTitle.innerHTML = `<i class="fa-solid fa-folder-pen"></i> Edit Customer File`;
    document.getElementById('customerIdInput').value = cust.id;
    document.getElementById('custFileNo').value = cust.fileNo || '';
    document.getElementById('custName').value = cust.name || '';
    document.getElementById('custIdNo').value = cust.idNo || '';
    document.getElementById('custAddress').value = cust.address || '';
    document.getElementById('custPhone').value = cust.phone || '';
    document.getElementById('custNotes').value = cust.notes || '';
    customerModal.classList.add('active');
  }

  closeCustModalBtn.addEventListener('click', () => customerModal.classList.remove('active'));
  cancelCustModalBtn.addEventListener('click', () => customerModal.classList.remove('active'));

  customerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('customerIdInput').value;
    const payload = {
      fileNo: document.getElementById('custFileNo').value,
      name: document.getElementById('custName').value,
      idNo: document.getElementById('custIdNo').value,
      address: document.getElementById('custAddress').value,
      phone: document.getElementById('custPhone').value,
      notes: document.getElementById('custNotes').value
    };

    const url = id ? `/api/customers/${id}` : '/api/customers';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast(id ? 'Customer record updated!' : 'Customer file added!', 'success');
        customerModal.classList.remove('active');
        loadCustomers(searchInput.value);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save customer file.', 'error');
      }
    } catch (err) {
      showToast('Error saving customer data.', 'error');
    }
  });

  // Toast Helper
  function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  }

  // Change Password Modal Handlers
  if (openChangePassBtn) {
    openChangePassBtn.addEventListener('click', () => {
      changePasswordModal.classList.add('active');
    });
  }
  if (closePassModalBtn) closePassModalBtn.addEventListener('click', () => changePasswordModal.classList.remove('active'));
  if (cancelPassModalBtn) cancelPassModalBtn.addEventListener('click', () => changePasswordModal.classList.remove('active'));

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPassword = document.getElementById('oldPass').value;
      const newPassword = document.getElementById('newPass').value;

      try {
        const res = await authFetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword, newPassword })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast('Password changed successfully!', 'success');
          changePasswordModal.classList.remove('active');
          changePasswordForm.reset();
        } else {
          showToast(data.error || 'Failed to change password.', 'error');
        }
      } catch (err) {
        showToast('Error updating password.', 'error');
      }
    });
  }

  // Initialize Session Check
  checkSession();
});
