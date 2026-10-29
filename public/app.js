document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const statusTitle = document.getElementById('statusTitle');
  const statusSub = document.getElementById('statusSub');
  const logoutBtn = document.getElementById('logoutBtn');
  const qrBanner = document.getElementById('qrBanner');
  const qrCodeImg = document.getElementById('qrCodeImg');
  const btnShowQr = document.getElementById('btnShowQr');
  const btnRefreshQr = document.getElementById('btnRefreshQr');
  const qrLoadingSpinner = document.getElementById('qrLoadingSpinner');
  const qrStatusHelp = document.getElementById('qrStatusHelp');

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
  const fileUploadInput = document.getElementById('fileUploadInput') || document.getElementById('imageUpload');
  const fileDropZone = document.getElementById('fileDropZone');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const multiFilesPreview = document.getElementById('multiFilesPreview');
  const filesListGrid = document.getElementById('filesListGrid');
  const clearAllFilesBtn = document.getElementById('clearAllFilesBtn');
  const attachedFilesBadge = document.getElementById('attachedFilesBadge');
  const previewCount = document.getElementById('previewCount');
  const sendBtn = document.getElementById('sendBtn');
  const historyList = document.getElementById('historyList');

  // Approval & E-Signature DOM Elements
  const openApprovalsBtn = document.getElementById('openApprovalsBtn');
  const navApprovalsBadge = document.getElementById('navApprovalsBadge');
  const openMyApprovalsBtn = document.getElementById('openMyApprovalsBtn');
  const navMyPendingBadge = document.getElementById('navMyPendingBadge');
  const chkRequireApproval = document.getElementById('chkRequireApproval');
  const approvalBoxContainer = document.getElementById('approvalBoxContainer');
  const approvalsModal = document.getElementById('approvalsModal');
  const closeApprovalsModalBtn = document.getElementById('closeApprovalsModalBtn');
  const closeApprovalsModalBtn2 = document.getElementById('closeApprovalsModalBtn2');
  const refreshApprovalsListBtn = document.getElementById('refreshApprovalsListBtn');
  const tabApprovalsPending = document.getElementById('tabApprovalsPending');
  const tabApprovalsApproved = document.getElementById('tabApprovalsApproved');
  const tabApprovalsRejected = document.getElementById('tabApprovalsRejected');
  const countPendingApprovals = document.getElementById('countPendingApprovals');
  const countApprovedApprovals = document.getElementById('countApprovedApprovals');
  const countRejectedApprovals = document.getElementById('countRejectedApprovals');
  const approvalsListContainer = document.getElementById('approvalsListContainer');
  const rejectRemarksModal = document.getElementById('rejectRemarksModal');
  const closeRejectModalBtn = document.getElementById('closeRejectModalBtn');
  const cancelRejectModalBtn = document.getElementById('cancelRejectModalBtn');
  const confirmRejectBtn = document.getElementById('confirmRejectBtn');
  const rejectTargetApprovalId = document.getElementById('rejectTargetApprovalId');
  const rejectionRemarksInput = document.getElementById('rejectionRemarksInput');

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
  const manageSectionsBtn = document.getElementById('manageSectionsBtn');
  const historyFilterGroup = document.getElementById('historyFilterGroup');
  const historySectionFilter = document.getElementById('historySectionFilter');

  const sectionsModal = document.getElementById('sectionsModal');
  const closeSectionsModalBtn = document.getElementById('closeSectionsModalBtn');
  const closeSectionsBtn2 = document.getElementById('closeSectionsBtn2');
  const sectionUserForm = document.getElementById('sectionUserForm');
  const sectionUserIdInput = document.getElementById('sectionUserIdInput');
  const secName = document.getElementById('secName');
  const secUsername = document.getElementById('secUsername');
  const secPassword = document.getElementById('secPassword');
  const secRole = document.getElementById('secRole');
  const sectionFormTitle = document.getElementById('sectionFormTitle');
  const saveSectionBtn = document.getElementById('saveSectionBtn');
  const cancelSectionEditBtn = document.getElementById('cancelSectionEditBtn');
  const sectionsTableBody = document.getElementById('sectionsTableBody');
  const sectionsCount = document.getElementById('sectionsCount');

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

      const isAdmin = user.role === 'admin';
      if (clearHistoryBtn) {
        clearHistoryBtn.style.display = isAdmin ? 'inline-flex' : 'none';
      }
      if (manageSectionsBtn) {
        manageSectionsBtn.style.display = isAdmin ? 'inline-flex' : 'none';
      }
      if (historyFilterGroup) {
        historyFilterGroup.style.display = isAdmin ? 'inline-flex' : 'none';
      }

      // WhatsApp Disconnect button: ONLY visible for Admin
      if (logoutBtn) {
        logoutBtn.style.display = (isAdmin && isWhatsAppReady) ? 'inline-flex' : 'none';
      }

      // DS Approvals button (Admin sees full approval hub; Section heads see their submissions)
      if (openApprovalsBtn) {
        openApprovalsBtn.style.display = isAdmin ? 'inline-flex' : 'none';
      }
      if (openMyApprovalsBtn) {
        openMyApprovalsBtn.style.display = isAdmin ? 'none' : 'inline-flex';
      }
      if (approvalBoxContainer) {
        approvalBoxContainer.style.display = 'block';
      }
      updateApprovalsBadge();

      // Do Not Reply Checkbox (Message Tick): ONLY modifiable by Admin! For Section users, it is locked/mandatory!
      const includeDoNotReply = document.getElementById('includeDoNotReply');
      const lockNoticeBadge = document.getElementById('lockNoticeBadge');
      const btnInsertDisclaimer = document.getElementById('btnInsertDisclaimer');
      const previewHeaderBox = document.getElementById('previewHeaderBox');

      if (includeDoNotReply) {
        if (!isAdmin) {
          includeDoNotReply.checked = true;
          includeDoNotReply.disabled = true;
          includeDoNotReply.style.display = 'none';
          if (lockNoticeBadge) lockNoticeBadge.style.display = 'inline-flex';
          if (btnInsertDisclaimer) btnInsertDisclaimer.style.display = 'none';
        } else {
          includeDoNotReply.disabled = false;
          includeDoNotReply.style.display = 'inline-block';
          if (lockNoticeBadge) lockNoticeBadge.style.display = 'none';
          if (btnInsertDisclaimer) btnInsertDisclaimer.style.display = 'inline-block';
        }
      }

      if (previewHeaderBox) {
        let sec = (!isAdmin && user.name) ? `\n📂 *අංශය:* ${user.name}` : '';
        previewHeaderBox.textContent = `━━━━━━━━━━━━━━━━━━━━\n🏛️ *ප්‍රාදේශීය ලේකම් කාර්යාලය - බණ්ඩාරවෙල*\n*(Divisional Secretariat - Bandarawela)*${sec}\n━━━━━━━━━━━━━━━━━━━━`;
      }

      if (isAdmin) {
        populateSectionFilterOptions();
      }
      updateScheduledBadge();

      // Automatically default Section accounts to Land / Customer Files!
      if (user.role === 'land_section' || user.role === 'section_user' || user.role === 'clerk') {
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
  let isRefreshingQr = false;

  async function triggerQrRefresh() {
    if (isRefreshingQr) return;
    isRefreshingQr = true;
    if (btnRefreshQr) {
      btnRefreshQr.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...`;
      btnRefreshQr.disabled = true;
    }
    if (qrLoadingSpinner) qrLoadingSpinner.style.display = 'flex';
    if (qrCodeImg) qrCodeImg.style.display = 'none';

    try {
      await fetch('/api/whatsapp/reconnect', { method: 'POST' });
      showToast('Reconnecting WhatsApp engine... Please scan the new QR code.', 'info');
      setTimeout(checkWhatsAppStatus, 1500);
    } catch (e) {
      showToast('Error requesting QR refresh.', 'error');
    } finally {
      setTimeout(() => {
        isRefreshingQr = false;
        if (btnRefreshQr) {
          btnRefreshQr.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Refresh QR Code (අලුත් කරන්න)`;
          btnRefreshQr.disabled = false;
        }
      }, 2000);
    }
  }

  if (btnRefreshQr) {
    btnRefreshQr.addEventListener('click', triggerQrRefresh);
  }

  if (btnShowQr) {
    btnShowQr.addEventListener('click', () => {
      if (qrBanner) {
        qrBanner.style.display = 'block';
        qrBanner.scrollIntoView({ behavior: 'smooth' });
      }
      triggerQrRefresh();
    });
  }

  async function checkWhatsAppStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (data.status === 'ready') {
        isWhatsAppReady = true;
        statusDot.className = 'status-indicator-dot online';
        statusTitle.textContent = 'WhatsApp Connected';
        statusSub.textContent = data.info ? `Online as +${data.info.wid}` : 'Ready to send messages';
        if (qrBanner) qrBanner.style.display = 'none';
        if (btnShowQr) btnShowQr.style.display = 'none';
        
        // Disconnect button only visible to Admin
        const isAdmin = currentUser && currentUser.role === 'admin';
        if (logoutBtn) logoutBtn.style.display = isAdmin ? 'inline-flex' : 'none';
        
        updateSendButtonState();
      } else if (data.status === 'qr' && data.qrCode) {
        isWhatsAppReady = false;
        statusDot.className = 'status-indicator-dot warning';
        statusTitle.textContent = 'Scan QR Code';
        statusSub.textContent = 'Waiting for WhatsApp scan...';
        if (qrCodeImg) {
          qrCodeImg.src = data.qrCode;
          qrCodeImg.style.display = 'block';
        }
        if (qrLoadingSpinner) qrLoadingSpinner.style.display = 'none';
        if (qrBanner) qrBanner.style.display = 'block';
        if (btnShowQr) btnShowQr.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        updateSendButtonState();
      } else if (data.status === 'authenticated') {
        isWhatsAppReady = false;
        statusDot.className = 'status-indicator-dot warning';
        statusTitle.textContent = 'Authenticating...';
        statusSub.textContent = 'Loading chats and session...';
        if (qrLoadingSpinner) qrLoadingSpinner.style.display = 'flex';
        if (qrCodeImg) qrCodeImg.style.display = 'none';
        if (qrBanner) qrBanner.style.display = 'block';
        if (btnShowQr) btnShowQr.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        updateSendButtonState();
      } else {
        // initializing, connecting, or disconnected
        isWhatsAppReady = false;
        statusDot.className = 'status-indicator-dot warning';
        statusTitle.textContent = 'Connecting WhatsApp...';
        statusSub.textContent = 'Generating QR code, please wait...';
        if (qrBanner) qrBanner.style.display = 'block';
        if (qrLoadingSpinner) qrLoadingSpinner.style.display = 'flex';
        if (qrCodeImg) qrCodeImg.style.display = 'none';
        if (btnShowQr) btnShowQr.style.display = 'inline-flex';
        if (logoutBtn) logoutBtn.style.display = 'none';
        updateSendButtonState();
      }
    } catch (err) {
      statusDot.className = 'status-indicator-dot';
      statusTitle.textContent = 'Server Offline';
      statusSub.textContent = 'Reconnecting to local server...';
      if (btnShowQr) btnShowQr.style.display = 'inline-flex';
    }
  }

  setInterval(checkWhatsAppStatus, 3000);
  checkWhatsAppStatus();

  logoutBtn.addEventListener('click', async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Access denied. Only Administrator can disconnect WhatsApp.', 'error');
      return;
    }
    if (confirm('Are you sure you want to disconnect this WhatsApp session? (Admin Only)')) {
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
    const isScheduled = enableSchedule && enableSchedule.checked;
    const isApproval = chkRequireApproval && chkRequireApproval.checked;

    if ((isWhatsAppReady || isApproval) && count > 0 && authToken) {
      sendBtn.removeAttribute('disabled');
      if (isApproval) {
        sendBtn.className = 'btn btn-warning btn-lg';
        sendBtn.innerHTML = count > 1
          ? `<i class="fa-solid fa-file-signature"></i> ලේකම්තුමාගේ අනුමැතියට යොමු කරන්න (${count} දෙනෙකුට)`
          : `<i class="fa-solid fa-file-signature"></i> ලේකම්තුමාගේ අනුමැතිය සහ E-Signature සඳහා යොමු කරන්න`;
      } else if (isScheduled) {
        sendBtn.className = 'btn btn-success btn-lg';
        sendBtn.innerHTML = count > 1
          ? `<i class="fa-solid fa-calendar-plus"></i> Schedule Bulk Message (${count} Recipients)`
          : `<i class="fa-solid fa-calendar-plus"></i> Schedule WhatsApp Message`;
      } else {
        sendBtn.className = 'btn btn-success btn-lg';
        if (count > 1) {
          sendBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Send Bulk Message (${count} Recipients)`;
        } else {
          sendBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Send via Office WhatsApp`;
        }
      }
    } else {
      sendBtn.setAttribute('disabled', 'true');
      sendBtn.className = 'btn btn-success btn-lg';
      if (!isWhatsAppReady && !isApproval) {
        sendBtn.innerHTML = `<i class="fa-solid fa-ban"></i> Connect WhatsApp to Send`;
      } else if (count === 0) {
        sendBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Select Recipient First`;
      } else {
        sendBtn.innerHTML = `<i class="fa-brands fa-whatsapp"></i> Send via Office WhatsApp`;
      }
    }
  }

  if (chkRequireApproval) {
    chkRequireApproval.addEventListener('change', updateSendButtonState);
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

  // --- 3. Quick Message Templates & Do Not Reply Notice ---
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const template = pill.getAttribute('data-template');
      if (template) {
        messageText.value = template;
        messageText.focus();
      }
    });
  });

  const btnInsertDisclaimer = document.getElementById('btnInsertDisclaimer');
  const includeDoNotReply = document.getElementById('includeDoNotReply');
  const disclaimerPreviewBox = document.getElementById('disclaimerPreviewBox');

  if (includeDoNotReply && disclaimerPreviewBox) {
    includeDoNotReply.addEventListener('change', () => {
      disclaimerPreviewBox.style.display = includeDoNotReply.checked ? 'block' : 'none';
    });
  }

  if (btnInsertDisclaimer) {
    btnInsertDisclaimer.addEventListener('click', () => {
      let secTag = '';
      if (currentUser && currentUser.name && currentUser.role !== 'admin') {
        secTag = `\n📂 *අංශය:* ${currentUser.name}`;
      }
      const headerText = `━━━━━━━━━━━━━━━━━━━━\n🏛️ *ප්‍රාදේශීය ලේකම් කාර්යාලය - බණ්ඩාරවෙල*\n*(Divisional Secretariat - Bandarawela)*${secTag}\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      const noticeText = `\n\n━━━━━━━━━━━━━━━━━━━━\n⚠️ *විශේෂ දැනුම්දීමයි:*\n*කරුණාකර මෙම පණිවිඩයට පිළිතුරු (Reply) නොඑවන්න.*\n*(Please DO NOT reply to this message)*\n━━━━━━━━━━━━━━━━━━━━`;
      
      let val = messageText.value.trim();
      if (!val.includes('ප්‍රාදේශීය ලේකම් කාර්යාලය - බණ්ඩාරවෙල')) {
        val = `${headerText}${val}`;
      }
      if (!val.includes('පිළිතුරු (Reply) නොඑවන්න') && !val.includes('Reply නොඑවන්න')) {
        val = `${val}${noticeText}`;
      }
      messageText.value = val;
      messageText.focus();
    });
  }

  // --- Scheduled Messages UI Wiring ---
  const enableSchedule = document.getElementById('enableSchedule');
  const scheduleTimeContainer = document.getElementById('scheduleTimeContainer');
  const scheduleDateTime = document.getElementById('scheduleDateTime');
  const btnViewScheduled = document.getElementById('btnViewScheduled');
  const scheduledBadgeCount = document.getElementById('scheduledBadgeCount');
  const scheduledModal = document.getElementById('scheduledModal');
  const closeScheduledModalBtn = document.getElementById('closeScheduledModalBtn');
  const closeScheduledModalBtn2 = document.getElementById('closeScheduledModalBtn2');
  const refreshScheduledBtn = document.getElementById('refreshScheduledBtn');
  const scheduledItemsList = document.getElementById('scheduledItemsList');

  if (enableSchedule) {
    enableSchedule.addEventListener('change', () => {
      if (enableSchedule.checked) {
        scheduleTimeContainer.style.display = 'block';
        if (!scheduleDateTime.value) {
          const nextHour = new Date(Date.now() + 60 * 60 * 1000);
          nextHour.setMinutes(0, 0, 0);
          const tzOffset = nextHour.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(nextHour.getTime() - tzOffset)).toISOString().slice(0, 16);
          scheduleDateTime.value = localISOTime;
        }
      } else {
        scheduleTimeContainer.style.display = 'none';
      }
      updateSendButtonState();
    });
  }

  if (btnViewScheduled) {
    btnViewScheduled.addEventListener('click', () => {
      loadScheduledMessages();
      scheduledModal.classList.add('active');
    });
  }
  if (closeScheduledModalBtn) {
    closeScheduledModalBtn.addEventListener('click', () => scheduledModal.classList.remove('active'));
  }
  if (closeScheduledModalBtn2) {
    closeScheduledModalBtn2.addEventListener('click', () => scheduledModal.classList.remove('active'));
  }
  if (refreshScheduledBtn) {
    refreshScheduledBtn.addEventListener('click', loadScheduledMessages);
  }

  async function updateScheduledBadge() {
    if (!authToken) return;
    try {
      const res = await authFetch('/api/scheduled');
      if (res.ok) {
        const list = await res.json();
        const pendingCount = list.filter(i => i.status === 'PENDING').length;
        if (scheduledBadgeCount) scheduledBadgeCount.textContent = pendingCount;
      }
    } catch (e) {}
  }

  async function loadScheduledMessages() {
    if (!scheduledItemsList) return;
    scheduledItemsList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 25px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading scheduled messages...</div>`;

    try {
      const res = await authFetch('/api/scheduled');
      const list = await res.json();
      const pendingCount = list.filter(i => i.status === 'PENDING').length;
      if (scheduledBadgeCount) scheduledBadgeCount.textContent = pendingCount;

      if (!Array.isArray(list) || list.length === 0) {
        scheduledItemsList.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 30px;">
            <i class="fa-regular fa-calendar-xmark" style="font-size: 2.2rem; color: #cbd5e1; margin-bottom: 8px; display: block;"></i>
            No scheduled messages found. (කලින් සැකසූ පණිවිඩ නොමැත)
          </div>
        `;
        return;
      }

      scheduledItemsList.innerHTML = list.map(item => {
        const isPending = item.status === 'PENDING';
        const targetDate = new Date(item.scheduledAt);
        const formattedDate = targetDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const formattedTime = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let statusBadge = `<span class="badge" style="background: #fef3c7; color: #92400e; font-size: 0.72rem;"><i class="fa-solid fa-clock"></i> PENDING</span>`;
        if (item.status === 'SENT') {
          statusBadge = `<span class="badge" style="background: #dcfce7; color: #166534; font-size: 0.72rem;"><i class="fa-solid fa-check-double"></i> SENT</span>`;
        } else if (item.status === 'FAILED') {
          statusBadge = `<span class="badge" style="background: #fee2e2; color: #991b1b; font-size: 0.72rem;"><i class="fa-solid fa-triangle-exclamation"></i> FAILED</span>`;
        }

        const senderBadge = item.sentBy
          ? `<span class="badge" style="background: #eff6ff; color: #1e40af; font-size: 0.72rem;"><i class="fa-solid fa-building-columns"></i> ${item.sentBy.name || item.sentBy.username}</span>`
          : '';

        return `
          <div class="scheduled-card" style="border: 1px solid ${isPending ? '#86efac' : 'var(--border-color)'}; background: ${isPending ? '#f0fdf4' : '#fff'}; border-radius: 8px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
                ${statusBadge}
                ${senderBadge}
                <strong>${item.recipientName}</strong>
                ${item.phone ? `<span style="font-size: 0.78rem; color: var(--text-muted);">(${item.phone})</span>` : ''}
              </div>
              <div style="font-size: 0.84rem; font-weight: 600; color: #15803d; margin-bottom: 4px;">
                <i class="fa-solid fa-calendar-day"></i> Scheduled: ${formattedDate} at ${formattedTime}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted); max-height: 48px; overflow: hidden; text-overflow: ellipsis; white-space: pre-wrap;">
                ${item.message.slice(0, 140)}${item.message.length > 140 ? '...' : ''}
              </div>
              ${item.attachment ? `<div style="font-size: 0.74rem; color: #2563eb; margin-top: 4px;"><i class="fa-solid fa-paperclip"></i> Photo/Attachment Included</div>` : ''}
            </div>
            ${isPending ? `
              <button type="button" class="btn btn-sm btn-outline-danger cancel-sched-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 0.76rem;" title="Cancel Scheduled Dispatch">
                <i class="fa-solid fa-xmark"></i> Cancel
              </button>
            ` : ''}
          </div>
        `;
      }).join('');

      document.querySelectorAll('.cancel-sched-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          if (confirm('Are you sure you want to cancel this scheduled message?')) {
            const delRes = await authFetch(`/api/scheduled/${id}`, { method: 'DELETE' });
            if (delRes.ok) {
              showToast('Scheduled message cancelled.', 'info');
              loadScheduledMessages();
            } else {
              showToast('Failed to cancel scheduled message.', 'error');
            }
          }
        });
      });

    } catch (e) {
      scheduledItemsList.innerHTML = `<div style="color: #ef4444; padding: 10px;">Failed to load scheduled messages.</div>`;
    }
  }

  setInterval(updateScheduledBadge, 30 * 1000);

  // --- 4. Multiple Files & PDF Documents Upload Handler ---
  let attachedFiles = [];

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function renderAttachedFilesUI() {
    if (!filesListGrid || !multiFilesPreview) return;

    if (attachedFiles.length === 0) {
      multiFilesPreview.style.display = 'none';
      if (attachedFilesBadge) attachedFilesBadge.style.display = 'none';
      filesListGrid.innerHTML = '';
      if (fileUploadInput) fileUploadInput.value = '';
      return;
    }

    multiFilesPreview.style.display = 'block';
    if (attachedFilesBadge) {
      attachedFilesBadge.style.display = 'inline-block';
      attachedFilesBadge.textContent = `${attachedFiles.length} File${attachedFiles.length > 1 ? 's' : ''} Attached`;
    }
    if (previewCount) {
      previewCount.textContent = attachedFiles.length;
    }

    filesListGrid.innerHTML = '';
    attachedFiles.forEach((file, index) => {
      const card = document.createElement('div');
      card.style.cssText = 'position: relative; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-align: center; min-height: 105px;';

      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      let iconOrThumb = '';
      if (isImage) {
        const objectUrl = URL.createObjectURL(file);
        iconOrThumb = `<img src="${objectUrl}" alt="thumb" style="width: 100%; height: 55px; object-fit: cover; border-radius: 4px; margin-bottom: 6px;">`;
      } else if (isPdf) {
        iconOrThumb = `<div style="height: 55px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px;"><i class="fa-solid fa-file-pdf" style="font-size: 2.2rem; color: #ef4444;"></i></div>`;
      } else {
        iconOrThumb = `<div style="height: 55px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px;"><i class="fa-solid fa-file-lines" style="font-size: 2.2rem; color: #3b82f6;"></i></div>`;
      }

      const escapedName = file.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      card.innerHTML = `
        <button type="button" class="remove-single-file-btn" data-index="${index}" title="Remove file" style="position: absolute; top: 4px; right: 4px; background: rgba(239, 68, 68, 0.9); color: white; border: none; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 0.7rem; line-height: 1; z-index: 2;">
          <i class="fa-solid fa-xmark"></i>
        </button>
        ${iconOrThumb}
        <div style="width: 100%; font-size: 0.72rem; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapedName}">${escapedName}</div>
        <div style="font-size: 0.68rem; color: #64748b; margin-top: 2px;">${formatFileSize(file.size)}</div>
      `;

      filesListGrid.appendChild(card);
    });

    // Add remove listeners
    filesListGrid.querySelectorAll('.remove-single-file-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(idx) && idx >= 0 && idx < attachedFiles.length) {
          attachedFiles.splice(idx, 1);
          renderAttachedFilesUI();
        }
      });
    });
  }

  function handleFilesAdded(fileList) {
    if (!fileList || fileList.length === 0) return;

    const maxFiles = 10;
    const maxSizeBytes = 30 * 1024 * 1024; // 30MB

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (attachedFiles.length >= maxFiles) {
        showToast(`Maximum ${maxFiles} attachments allowed.`, 'error');
        break;
      }
      if (file.size > maxSizeBytes) {
        showToast(`File "${file.name}" exceeds 30MB limit.`, 'error');
        continue;
      }
      const exists = attachedFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
      if (!exists) {
        attachedFiles.push(file);
      }
    }

    renderAttachedFilesUI();
  }

  if (fileDropZone) {
    fileDropZone.addEventListener('click', (e) => {
      if (fileUploadInput) fileUploadInput.click();
    });

    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.style.borderColor = '#2563eb';
      fileDropZone.style.background = '#eff6ff';
    });

    fileDropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      fileDropZone.style.borderColor = '#93c5fd';
      fileDropZone.style.background = '#f8fafc';
    });

    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.style.borderColor = '#93c5fd';
      fileDropZone.style.background = '#f8fafc';
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFilesAdded(e.dataTransfer.files);
      }
    });
  }

  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFilesAdded(e.target.files);
        fileUploadInput.value = '';
      }
    });
  }

  if (clearAllFilesBtn) {
    clearAllFilesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      attachedFiles = [];
      renderAttachedFilesUI();
    });
  }

  // --- 5. Message Form Submit (Send WhatsApp) ---
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isApproval = chkRequireApproval && chkRequireApproval.checked;

    if (!isApproval && !isWhatsAppReady) {
      showToast('WhatsApp is not connected yet!', 'error');
      return;
    }

    if (selectedMap.size === 0) {
      showToast('Please select at least one recipient (officer or customer) first.', 'error');
      return;
    }

    const text = messageText.value.trim();

    if (!text && attachedFiles.length === 0) {
      showToast('Please enter a message or attach at least one photo or PDF document.', 'error');
      return;
    }

    // Format Official Bandarawela DS Heading
    let secTag = '';
    if (currentUser && currentUser.name && currentUser.role !== 'admin') {
      secTag = `\n📂 *අංශය:* ${currentUser.name}`;
    }
    const officialHeader = `━━━━━━━━━━━━━━━━━━━━\n🏛️ *ප්‍රාදේශීය ලේකම් කාර්යාලය - බණ්ඩාරවෙල*\n*(Divisional Secretariat - Bandarawela)*${secTag}\n━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Highlighted 'Do Not Reply' Notice
    const noReplyDisclaimer = `\n\n━━━━━━━━━━━━━━━━━━━━\n⚠️ *විශේෂ දැනුම්දීමයි:*\n*කරුණාකර මෙම පණිවිඩයට පිළිතුරු (Reply) නොඑවන්න.*\n*(Please DO NOT reply to this message)*\n━━━━━━━━━━━━━━━━━━━━`;

    // Only Admin can untick notice; For all other users (sections) it is permanently MANDATORY!
    const isAdmin = currentUser && currentUser.role === 'admin';
    const includeNotice = !isAdmin || document.getElementById('includeDoNotReply')?.checked;

    let messageToSend = text;

    // Attach Official Heading if not already present
    if (messageToSend && !messageToSend.includes('ප්‍රාදේශීය ලේකම් කාර්යාලය - බණ්ඩාරවෙල')) {
      messageToSend = `${officialHeader}${messageToSend}`;
    }

    // Attach 'Do Not Reply' Notice if enabled / mandatory
    if (includeNotice) {
      const alreadyHasNotice = messageToSend.includes('පිළිතුරු (Reply) නොඑවන්න') || 
                               messageToSend.includes('Reply නොඑවන්න') || 
                               messageToSend.includes('DO NOT reply') ||
                               messageToSend.includes('Do not reply');
      if (!alreadyHasNotice) {
        messageToSend = messageToSend ? `${messageToSend}${noReplyDisclaimer}` : `${officialHeader.trim()}${noReplyDisclaimer}`;
      }
    } else if (!messageToSend && attachedFiles.length > 0) {
      messageToSend = `${officialHeader.trim()}`;
    }

    const count = selectedMap.size;
    const isBulk = count > 1;

    // Branch A: Request DS Approval & E-Signature
    if (isApproval) {
      sendBtn.setAttribute('disabled', 'true');
      sendBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting for DS Approval...`;

      try {
        const formData = new FormData();
        formData.append('message', messageToSend);
        attachedFiles.forEach(f => formData.append('attachments', f));

        if (isBulk) {
          const recipientsArray = Array.from(selectedMap.values()).map(r => ({
            id: r.id,
            name: r.name,
            phone: r.phone,
            fileNo: r.fileNo || ''
          }));
          formData.append('isBulk', 'true');
          formData.append('recipients', JSON.stringify(recipientsArray));
        } else {
          const singleRecipient = Array.from(selectedMap.values())[0];
          formData.append('isBulk', 'false');
          formData.append('officerId', singleRecipient.id || '');
          formData.append('phone', singleRecipient.phone);
          formData.append('recipientName', singleRecipient.name);
          formData.append('fileNo', singleRecipient.fileNo || '');
        }

        const res = await authFetch('/api/approvals/request', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showToast(data.message || 'Submitted for DS Approval!', 'success');
          messageText.value = '';
          attachedFiles = [];
          renderAttachedFilesUI();
          selectedMap.clear();
          updateSelectionUI();
          if (chkRequireApproval) chkRequireApproval.checked = false;
          updateApprovalsBadge();
        } else {
          showToast(data.error || 'Failed to submit approval request.', 'error');
        }
      } catch (err) {
        console.error('Approval submit error:', err);
        showToast('Network error submitting approval request.', 'error');
      } finally {
        updateSendButtonState();
      }
      return;
    }

    // Branch B: Direct Scheduled or Immediate WhatsApp Dispatch
    const isScheduled = enableSchedule && enableSchedule.checked;
    let scheduledIso = null;

    if (isScheduled) {
      if (!scheduleDateTime || !scheduleDateTime.value) {
        showToast('Please select a scheduled date and time.', 'error');
        return;
      }
      const targetTime = new Date(scheduleDateTime.value).getTime();
      if (isNaN(targetTime) || targetTime <= Date.now()) {
        showToast('Scheduled date & time must be in the future.', 'error');
        return;
      }
      scheduledIso = new Date(scheduleDateTime.value).toISOString();
    }

    sendBtn.setAttribute('disabled', 'true');
    sendBtn.innerHTML = isScheduled
      ? `<i class="fa-solid fa-circle-notch fa-spin"></i> Scheduling message...`
      : (isBulk
          ? `<i class="fa-solid fa-circle-notch fa-spin"></i> Dispatched bulk messages...`
          : `<i class="fa-solid fa-circle-notch fa-spin"></i> Sending via WhatsApp...`);

    try {
      let res, data;
      if (isScheduled) {
        const formData = new FormData();
        formData.append('scheduledAt', scheduledIso);
        formData.append('message', messageToSend);
        attachedFiles.forEach(f => formData.append('attachments', f));

        if (isBulk) {
          const recipientsArray = Array.from(selectedMap.values()).map(r => ({
            id: r.id,
            name: r.name,
            phone: r.phone,
            fileNo: r.fileNo || ''
          }));
          formData.append('isBulk', 'true');
          formData.append('recipients', JSON.stringify(recipientsArray));
        } else {
          const singleRecipient = Array.from(selectedMap.values())[0];
          formData.append('isBulk', 'false');
          formData.append('officerId', singleRecipient.id || '');
          formData.append('phone', singleRecipient.phone);
          formData.append('recipientName', singleRecipient.name);
        }

        res = await authFetch('/api/schedule', {
          method: 'POST',
          body: formData
        });
        data = await res.json();
      } else if (isBulk) {
        const recipientsArray = Array.from(selectedMap.values()).map(r => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          fileNo: r.fileNo || ''
        }));

        const formData = new FormData();
        formData.append('recipients', JSON.stringify(recipientsArray));
        formData.append('message', messageToSend);
        attachedFiles.forEach(f => formData.append('attachments', f));

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
        formData.append('message', messageToSend);
        attachedFiles.forEach(f => formData.append('attachments', f));

        res = await authFetch('/api/send', {
          method: 'POST',
          body: formData
        });
        data = await res.json();
      }

      if (res.ok && data.success) {
        showToast(data.message || `Action completed successfully!`, 'success');
        messageText.value = '';
        attachedFiles = [];
        renderAttachedFilesUI();
        selectedMap.clear();
        updateSelectionUI();
        if (enableSchedule) {
          enableSchedule.checked = false;
          scheduleTimeContainer.style.display = 'none';
        }
        updateScheduledBadge();
        loadHistory();
      } else {
        showToast(data.error || 'Failed to dispatch message.', 'error');
      }
    } catch (err) {
      console.error('Send error:', err);
      showToast('Network error processing request.', 'error');
    } finally {
      updateSendButtonState();
    }
  });

  // --- 6. Message History Log ---
  async function populateSectionFilterOptions() {
    if (!historySectionFilter) return;
    try {
      const res = await authFetch('/api/sections');
      if (!res.ok) return;
      const sections = await res.json();
      const currentVal = historySectionFilter.value;
      historySectionFilter.innerHTML = '<option value="all">All Sections (සියලුම අංශ)</option>' +
        sections.map(s => `<option value="${s.username}">${s.name}</option>`).join('');
      if (currentVal) historySectionFilter.value = currentVal;
    } catch (e) {
      console.error('Error fetching sections for filter:', e);
    }
  }

  if (historySectionFilter) {
    historySectionFilter.addEventListener('change', () => {
      loadHistory();
    });
  }

  async function loadHistory() {
    if (!authToken) return;
    try {
      const selectedSection = historySectionFilter ? historySectionFilter.value : 'all';
      const url = `/api/history?section=${encodeURIComponent(selectedSection)}`;
      const res = await authFetch(url);
      if (!res.ok) return;
      const history = await res.json();

      if (history.length === 0) {
        historyList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px; text-align: center;">No sent messages found for this selection.</div>`;
        return;
      }

      const isAdmin = currentUser && currentUser.role === 'admin';

      historyList.innerHTML = history.slice(0, 30).map(item => {
        const senderBadge = item.sentBy
          ? `<span class="badge" style="background: #ede9fe; color: #5b21b6; margin-right: 6px; font-weight: 600; font-size: 0.73rem;"><i class="fa-solid fa-building-columns"></i> ${item.sentBy.name || item.sentBy.username}</span>`
          : `<span class="badge" style="background: #f1f5f9; color: #475569; margin-right: 6px; font-size: 0.73rem;"><i class="fa-solid fa-building-columns"></i> General</span>`;

        return `
        <div class="history-item" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 10px 12px; border-left: 3px solid ${item.sentBy && item.sentBy.role === 'admin' ? '#059669' : '#3b82f6'};">
          <div style="flex: 1; min-width: 0;">
            <div style="margin-bottom: 4px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
              ${senderBadge}
              <strong>${item.officerName}</strong>
              <span style="color: var(--text-muted); font-size: 0.78rem;">(${item.phone})</span>
            </div>
            <div style="color: var(--text-muted); font-size: 0.82rem; word-break: break-word;">
              ${item.message ? item.message : '[Image Attachment]'}
            </div>
          </div>
          <div style="text-align: right; display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <div>
              <span class="badge" style="background: #dcfce7; color: #15803d;"><i class="fa-solid fa-check"></i> ${item.status}</span>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                ${new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            ${isAdmin ? `
              <button class="btn btn-icon delete-hist-btn" data-id="${item.id}" title="Delete Item">
                <i class="fa-solid fa-trash" style="color: #ef4444; font-size: 0.85rem;"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;}).join('');

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

  // --- 8. Section Accounts Management (Admin Only) ---
  if (manageSectionsBtn) {
    manageSectionsBtn.addEventListener('click', openSectionsModal);
  }
  if (closeSectionsModalBtn) {
    closeSectionsModalBtn.addEventListener('click', () => sectionsModal.classList.remove('active'));
  }
  if (closeSectionsBtn2) {
    closeSectionsBtn2.addEventListener('click', () => sectionsModal.classList.remove('active'));
  }
  if (cancelSectionEditBtn) {
    cancelSectionEditBtn.addEventListener('click', resetSectionForm);
  }

  function resetSectionForm() {
    sectionUserForm.reset();
    sectionUserIdInput.value = '';
    sectionFormTitle.textContent = 'Add New Section Account (නව අංශයක් එක් කරන්න)';
    saveSectionBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Section Account';
    cancelSectionEditBtn.style.display = 'none';
  }

  async function openSectionsModal() {
    resetSectionForm();
    sectionsModal.classList.add('active');
    loadSectionsTable();
  }

  async function loadSectionsTable() {
    try {
      const res = await authFetch('/api/users');
      if (!res.ok) return;
      const users = await res.json();

      sectionsCount.textContent = users.length;
      sectionsTableBody.innerHTML = users.map(u => `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 10px 12px;">
            <strong>${u.name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Role / View: ${u.role}</div>
          </td>
          <td style="padding: 10px 12px; font-family: monospace; font-size: 0.9rem; color: #1e40af; font-weight: 600;">${u.username}</td>
          <td style="padding: 10px 12px; font-family: monospace; color: #475569;">${u.password || '••••••'}</td>
          <td style="padding: 10px 12px; text-align: right; white-space: nowrap;">
            <button class="btn btn-icon edit-sec-btn" data-id="${u.id}" title="Edit Section Account" style="color: #2563eb; margin-right: 4px;">
              <i class="fa-solid fa-pen"></i>
            </button>
            ${u.id !== 'usr_1' ? `
              <button class="btn btn-icon delete-sec-btn" data-id="${u.id}" data-name="${u.name}" title="Delete Section Account" style="color: #ef4444;">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : '<span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">Primary Admin</span>'}
          </td>
        </tr>
      `).join('');

      document.querySelectorAll('.edit-sec-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const uId = btn.getAttribute('data-id');
          const target = users.find(u => u.id === uId);
          if (target) {
            sectionUserIdInput.value = target.id;
            secName.value = target.name;
            secUsername.value = target.username;
            secPassword.value = target.password || '';
            secRole.value = target.role;
            sectionFormTitle.textContent = `Edit Section: ${target.name}`;
            saveSectionBtn.innerHTML = '<i class="fa-solid fa-check"></i> Update Section Account';
            cancelSectionEditBtn.style.display = 'inline-block';
            secName.focus();
          }
        });
      });

      document.querySelectorAll('.delete-sec-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const uId = btn.getAttribute('data-id');
          const uName = btn.getAttribute('data-name');
          if (confirm(`Are you sure you want to remove section account "${uName}"?`)) {
            const delRes = await authFetch(`/api/users/${uId}`, { method: 'DELETE' });
            const data = await delRes.json();
            if (delRes.ok && data.success) {
              showToast('Section account removed successfully!', 'success');
              loadSectionsTable();
              populateSectionFilterOptions();
            } else {
              showToast(data.error || 'Failed to remove section.', 'error');
            }
          }
        });
      });
    } catch (e) {
      console.error('Error loading sections table:', e);
    }
  }

  if (sectionUserForm) {
    sectionUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = sectionUserIdInput.value;
      const payload = {
        name: secName.value.trim(),
        username: secUsername.value.trim(),
        password: secPassword.value.trim(),
        role: secRole.value
      };

      const url = id ? `/api/users/${id}` : '/api/users';
      const method = id ? 'PUT' : 'POST';

      try {
        const res = await authFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(data.message || (id ? 'Section updated!' : 'Section account created!'), 'success');
          resetSectionForm();
          loadSectionsTable();
          populateSectionFilterOptions();
        } else {
          showToast(data.error || 'Failed to save section.', 'error');
        }
      } catch (err) {
        showToast('Error saving section account.', 'error');
      }
    });
  }

  // ===============================================
  // --- 7. DS Approvals & E-Signature Hub Logic ---
  // ===============================================
  let activeApprovalsTab = 'pending';

  async function updateApprovalsBadge() {
    if (!authToken) return;
    try {
      const res = await authFetch('/api/approvals/count-pending');
      if (!res.ok) return;
      const data = await res.json();
      const count = data.pendingCount || 0;

      if (navApprovalsBadge) {
        navApprovalsBadge.textContent = count;
        navApprovalsBadge.style.display = count > 0 ? 'inline-block' : 'none';
      }
      if (navMyPendingBadge) {
        navMyPendingBadge.textContent = count;
        navMyPendingBadge.style.display = count > 0 ? 'inline-block' : 'none';
      }
      if (countPendingApprovals) {
        countPendingApprovals.textContent = count;
      }
    } catch (e) {}
  }

  setInterval(updateApprovalsBadge, 30 * 1000);

  function switchApprovalsTab(tabName) {
    activeApprovalsTab = tabName;
    if (tabApprovalsPending) {
      tabApprovalsPending.classList.toggle('active', tabName === 'pending');
      tabApprovalsPending.style.color = tabName === 'pending' ? '#2563eb' : '#64748b';
      tabApprovalsPending.style.borderBottom = tabName === 'pending' ? '2px solid #2563eb' : 'none';
    }
    if (tabApprovalsApproved) {
      tabApprovalsApproved.classList.toggle('active', tabName === 'approved');
      tabApprovalsApproved.style.color = tabName === 'approved' ? '#16a34a' : '#64748b';
      tabApprovalsApproved.style.borderBottom = tabName === 'approved' ? '2px solid #16a34a' : 'none';
    }
    if (tabApprovalsRejected) {
      tabApprovalsRejected.classList.toggle('active', tabName === 'rejected');
      tabApprovalsRejected.style.color = tabName === 'rejected' ? '#dc2626' : '#64748b';
      tabApprovalsRejected.style.borderBottom = tabName === 'rejected' ? '2px solid #dc2626' : 'none';
    }
    loadApprovalsList(tabName);
  }

  if (tabApprovalsPending) tabApprovalsPending.addEventListener('click', () => switchApprovalsTab('pending'));
  if (tabApprovalsApproved) tabApprovalsApproved.addEventListener('click', () => switchApprovalsTab('approved'));
  if (tabApprovalsRejected) tabApprovalsRejected.addEventListener('click', () => switchApprovalsTab('rejected'));

  async function loadApprovalsList(statusFilter = activeApprovalsTab) {
    if (!approvalsListContainer) return;
    approvalsListContainer.innerHTML = `<div style="text-align:center; padding: 25px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem;"></i><br><span style="margin-top: 8px; display: inline-block;">Loading approvals...</span></div>`;

    try {
      const res = await authFetch(`/api/approvals?status=${statusFilter}`);
      if (!res.ok) throw new Error('Failed to fetch approvals');
      const items = await res.json();

      // Also get all to update tab counts
      const resAll = await authFetch('/api/approvals');
      if (resAll.ok) {
        const allItems = await resAll.json();
        const pendingCount = allItems.filter(a => a.status === 'pending').length;
        const approvedCount = allItems.filter(a => a.status === 'approved').length;
        const rejectedCount = allItems.filter(a => a.status === 'rejected').length;

        if (countPendingApprovals) countPendingApprovals.textContent = pendingCount;
        if (countApprovedApprovals) countApprovedApprovals.textContent = approvedCount;
        if (countRejectedApprovals) countRejectedApprovals.textContent = rejectedCount;
        if (navApprovalsBadge) {
          navApprovalsBadge.textContent = pendingCount;
          navApprovalsBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }
      }

      if (items.length === 0) {
        const emptyMsg = statusFilter === 'pending'
          ? 'අනුමැතිය අපේක්ෂිත ලිපි කිසිවක් නොමැත. (No pending approval requests)'
          : (statusFilter === 'approved'
              ? 'අනුමත කළ ලිපි කිසිවක් නොමැත. (No approved letters yet)'
              : 'සංශෝධන සඳහා යැවූ ලිපි කිසිවක් නොමැත. (No rejected requests)');

        approvalsListContainer.innerHTML = `
          <div style="text-align: center; padding: 35px 20px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; color: #64748b;">
            <i class="fa-solid fa-folder-open" style="font-size: 2.2rem; color: #94a3b8; margin-bottom: 10px;"></i>
            <div style="font-size: 0.92rem; font-weight: 600;">${emptyMsg}</div>
          </div>
        `;
        return;
      }

      const isAdmin = currentUser && currentUser.role === 'admin';
      approvalsListContainer.innerHTML = '';

      items.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 10px;';

        const createdDate = new Date(item.createdAt).toLocaleString('en-GB');
        const sectionBadge = item.requestedBy ? item.requestedBy.name : 'Unknown Section';

        let statusBadgeHtml = '';
        if (item.status === 'pending') {
          statusBadgeHtml = `<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 600;"><i class="fa-solid fa-clock"></i> අනුමැතිය අපේක්ෂිත (Pending)</span>`;
        } else if (item.status === 'approved') {
          statusBadgeHtml = `<span style="background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> අනුමතයි - E-Signed & Sent</span>`;
        } else if (item.status === 'rejected') {
          statusBadgeHtml = `<span style="background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> සංශෝධන අවශ්‍යයි (Rejected)</span>`;
        }

        // Recipient details
        let recipientInfoHtml = '';
        if (item.isBulk) {
          recipientInfoHtml = `<strong>කණ්ඩායම් පණිවිඩයක් (Bulk):</strong> ${item.recipients ? item.recipients.length : 0} Recipients`;
        } else if (item.recipient) {
          const fileNoTag = item.recipient.fileNo ? ` <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">📂 ගොනු අංකය: ${item.recipient.fileNo}</span>` : '';
          recipientInfoHtml = `<strong>${item.recipient.name}</strong> (${item.recipient.phone})${fileNoTag}`;
        }

        // Attachments HTML
        let attachmentsHtml = '';
        if (item.attachments && item.attachments.length > 0) {
          attachmentsHtml = `
            <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px;">
              <span style="font-size: 0.76rem; color: #64748b; font-weight: 600;"><i class="fa-solid fa-paperclip"></i> අමුණා ඇති ලිපි/Files:</span>
              ${item.attachments.map(att => {
                const isPdf = (att.mimetype === 'application/pdf') || (att.filename && att.filename.endsWith('.pdf'));
                const icon = isPdf ? '<i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i>' : '<i class="fa-solid fa-image" style="color: #3b82f6;"></i>';
                return `<a href="/uploads/${att.filename}" target="_blank" style="text-decoration: none; background: #f1f5f9; border: 1px solid #e2e8f0; color: #1e293b; padding: 3px 8px; border-radius: 4px; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;">
                  ${icon} ${att.originalname || att.filename}
                </a>`;
              }).join('')}
            </div>
          `;
        }

        // Signed PDF preview if approved
        let signedFilesHtml = '';
        if (item.status === 'approved' && item.signedFiles && item.signedFiles.length > 0) {
          signedFilesHtml = `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px; margin-top: 6px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-stamp" style="color: #16a34a; font-size: 1.2rem;"></i>
                <div>
                  <span style="font-size: 0.8rem; font-weight: 700; color: #166534; display: block;">ප්‍රාදේශීය ලේකම් නිල ඩිජිටල් අත්සන සහිත PDF (Signed Document):</span>
                  <span style="font-size: 0.74rem; color: #15803d;">අනුමත කළ දිනය: ${item.reviewedAt ? new Date(item.reviewedAt).toLocaleString('en-GB') : ''}</span>
                </div>
              </div>
              ${item.signedFiles.map(sf => `<a href="${sf.url}" target="_blank" class="btn btn-sm btn-success" style="font-size: 0.78rem; text-decoration: none; padding: 4px 10px;">
                <i class="fa-solid fa-file-arrow-down"></i> අත්සන් කළ PDF එක බලන්න
              </a>`).join('')}
            </div>
          `;
        }

        // Rejection remarks if rejected
        let rejectionBoxHtml = '';
        if (item.status === 'rejected' && item.rejectionRemarks) {
          rejectionBoxHtml = `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 12px; margin-top: 6px; color: #991b1b; font-size: 0.8rem;">
              <strong><i class="fa-solid fa-comment-dots"></i> ලේකම්තුමාගේ සංශෝධන සටහන:</strong> "${item.rejectionRemarks}"
            </div>
          `;
        }

        // Action buttons
        let actionButtonsHtml = '';
        if (item.status === 'pending') {
          if (isAdmin) {
            actionButtonsHtml = `
              <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm btn-danger btn-reject-approval" data-id="${item.id}" data-ref="${item.verificationCode}" style="padding: 6px 14px; font-size: 0.82rem; font-weight: 600;">
                  <i class="fa-solid fa-xmark"></i> සංශෝධන දන්වන්න (Reject)
                </button>
                <button type="button" class="btn btn-sm btn-success btn-approve-approval" data-id="${item.id}" data-ref="${item.verificationCode}" style="padding: 6px 18px; font-size: 0.82rem; font-weight: 700; background: #16a34a; border-color: #15803d; box-shadow: 0 2px 4px rgba(22,163,74,0.25);">
                  <i class="fa-solid fa-signature"></i> අනුමත කර E-Sign කරන්න (Approve & E-Sign)
                </button>
              </div>
            `;
          } else {
            actionButtonsHtml = `
              <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;">
                <button type="button" class="btn btn-sm btn-outline-danger btn-delete-approval" data-id="${item.id}" style="padding: 4px 10px; font-size: 0.78rem;">
                  <i class="fa-solid fa-trash-can"></i> ඉල්ලීම අවලංගු කරන්න
                </button>
              </div>
            `;
          }
        }

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge" style="background: #eff6ff; color: #1d4ed8; font-weight: 700; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem;">
                <i class="fa-solid fa-folder-closed"></i> ${sectionBadge}
              </span>
              <span style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: #475569; background: #f8fafc; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                ${item.verificationCode}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.75rem; color: #64748b;"><i class="fa-regular fa-clock"></i> ${createdDate}</span>
              ${statusBadgeHtml}
            </div>
          </div>

          <div style="font-size: 0.85rem; color: #1e293b;">
            ${recipientInfoHtml}
          </div>

          <div style="background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 4px; padding: 8px 12px; font-size: 0.85rem; color: #334155; line-height: 1.45; white-space: pre-wrap;">${item.message || '<em style="color:#94a3b8;">[No text message, attachments only]</em>'}</div>

          ${attachmentsHtml}
          ${signedFilesHtml}
          ${rejectionBoxHtml}
          ${actionButtonsHtml}
        `;

        approvalsListContainer.appendChild(card);
      });

      // Hook up Approve buttons
      approvalsListContainer.querySelectorAll('.btn-approve-approval').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const ref = btn.getAttribute('data-ref');
          executeApproveAndSign(id, ref);
        });
      });

      // Hook up Reject buttons
      approvalsListContainer.querySelectorAll('.btn-reject-approval').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (rejectTargetApprovalId) rejectTargetApprovalId.value = id;
          if (rejectionRemarksInput) rejectionRemarksInput.value = '';
          if (rejectRemarksModal) rejectRemarksModal.classList.add('active');
        });
      });

      // Hook up Delete buttons
      approvalsListContainer.querySelectorAll('.btn-delete-approval').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm('මෙම අනුමැති ඉල්ලීම ඉවත් කිරීමට අවශ්‍ය බව තහවුරු කරන්න?')) {
            const resDel = await authFetch(`/api/approvals/${id}`, { method: 'DELETE' });
            if (resDel.ok) {
              showToast('Approval request removed.', 'info');
              loadApprovalsList(activeApprovalsTab);
              updateApprovalsBadge();
            }
          }
        });
      });

    } catch (err) {
      console.error('Error loading approvals:', err);
      approvalsListContainer.innerHTML = `<div style="color: #ef4444; padding: 15px; text-align: center;">Failed to load approvals.</div>`;
    }
  }

  async function executeApproveAndSign(id, ref) {
    if (!isWhatsAppReady) {
      showToast('WhatsApp is not connected! Please scan QR code first.', 'error');
      return;
    }

    if (!confirm(`ප්‍රාදේශීය ලේකම් නිල ඩිජිටල් අත්සන (E-Signature) සහ මුද්‍රාව තබා මෙම ලේඛනය (${ref}) අනුමත කර WhatsApp හරහා යැවීම තහවුරු කරන්නද?`)) {
      return;
    }

    showToast('Stamping E-Signature & dispatching WhatsApp message...', 'info');

    try {
      const res = await authFetch(`/api/approvals/${id}/approve`, { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(data.message || 'Approved & E-Signed successfully!', 'success');
        switchApprovalsTab('approved');
        updateApprovalsBadge();
        loadHistory();
      } else {
        showToast(data.error || 'Failed to approve document.', 'error');
      }
    } catch (err) {
      console.error('Approve error:', err);
      showToast('Network error while approving document.', 'error');
    }
  }

  // Reject remarks modal confirm
  if (confirmRejectBtn) {
    confirmRejectBtn.addEventListener('click', async () => {
      const id = rejectTargetApprovalId ? rejectTargetApprovalId.value : null;
      const remarks = rejectionRemarksInput ? rejectionRemarksInput.value.trim() : '';
      if (!id) return;
      if (!remarks) {
        showToast('Please enter a rejection remark.', 'error');
        return;
      }

      confirmRejectBtn.disabled = true;
      confirmRejectBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

      try {
        const res = await authFetch(`/api/approvals/${id}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remarks })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(data.message || 'Returned with remarks.', 'info');
          if (rejectRemarksModal) rejectRemarksModal.classList.remove('active');
          switchApprovalsTab('rejected');
          updateApprovalsBadge();
        } else {
          showToast(data.error || 'Failed to reject approval.', 'error');
        }
      } catch (e) {
        showToast('Network error while rejecting.', 'error');
      } finally {
        confirmRejectBtn.disabled = false;
        confirmRejectBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> සටහන සමඟ හරවා යවන්න`;
      }
    });
  }

  if (closeRejectModalBtn) closeRejectModalBtn.addEventListener('click', () => rejectRemarksModal.classList.remove('active'));
  if (cancelRejectModalBtn) cancelRejectModalBtn.addEventListener('click', () => rejectRemarksModal.classList.remove('active'));

  // Approvals Modal Open / Close Handlers
  if (openApprovalsBtn) {
    openApprovalsBtn.addEventListener('click', () => {
      switchApprovalsTab('pending');
      approvalsModal.classList.add('active');
    });
  }

  if (openMyApprovalsBtn) {
    openMyApprovalsBtn.addEventListener('click', () => {
      switchApprovalsTab('pending');
      approvalsModal.classList.add('active');
    });
  }

  if (closeApprovalsModalBtn) closeApprovalsModalBtn.addEventListener('click', () => approvalsModal.classList.remove('active'));
  if (closeApprovalsModalBtn2) closeApprovalsModalBtn2.addEventListener('click', () => approvalsModal.classList.remove('active'));
  if (refreshApprovalsListBtn) refreshApprovalsListBtn.addEventListener('click', () => loadApprovalsList(activeApprovalsTab));

  // Initialize Session Check
  checkSession();
});
