
/* =========================================
   SCHOOLBORROW
   Three-role borrowing management system
   ========================================= */

const KEYS = {
  items: "sb_items",
  borrowers: "sb_borrowers",
  transactions: "sb_transactions",
  accounts: "sb_accounts",
  requests: "sb_requests",
  session: "sb_session"
};

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "school123";

let currentUser = null;
let currentPage = "";
let toastTimer = null;

const $ = id => document.getElementById(id);

function read(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(fallback) ? (Array.isArray(value) ? value : fallback)
      : (value ?? fallback);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function items() { return read(KEYS.items); }
function borrowers() { return read(KEYS.borrowers); }
function transactions() { return read(KEYS.transactions); }
function accounts() { return read(KEYS.accounts); }
function requests() { return read(KEYS.requests); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function today() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function roleName(role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getItem(id) {
  return items().find(item => String(item.id) === String(id));
}

function getBorrower(id) {
  return borrowers().find(person => String(person.id) === String(id));
}

function getAccount(id) {
  return accounts().find(account => String(account.id) === String(id));
}

function getItemName(id) {
  return getItem(id)?.name || "Deleted item";
}

function getBorrowerName(id) {
  return getBorrower(id)?.name || "Unknown borrower";
}

function isReturned(transaction) {
  return String(transaction.status).toLowerCase() === "returned";
}

function isOverdue(transaction) {
  return !isReturned(transaction) &&
    transaction.returnDate &&
    transaction.returnDate < today();
}

function transactionStatus(transaction) {
  if (isReturned(transaction)) return "Returned";
  if (isOverdue(transaction)) return "Overdue";
  return "Borrowed";
}

function statusBadge(status) {
  const value = String(status).toLowerCase();
  return `<span class="status ${escapeHTML(value)}">${escapeHTML(status)}</span>`;
}

function showToast(message, error = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = "toast show" + (error ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

/* ---------- DATA INITIALIZATION ---------- */

function initializeData() {
  // Preserve existing inventory records and storage keys.
  const currentItems = items().map(item => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    return {
      ...item,
      quantity,
      available: item.available === undefined
        ? quantity
        : Math.max(0, Number(item.available) || 0)
    };
  });

  save(KEYS.items, currentItems);

  // Preserve existing borrower and transaction records.
  if (!localStorage.getItem(KEYS.borrowers)) save(KEYS.borrowers, []);
  if (!localStorage.getItem(KEYS.transactions)) save(KEYS.transactions, []);
  if (!localStorage.getItem(KEYS.accounts)) save(KEYS.accounts, []);
  if (!localStorage.getItem(KEYS.requests)) save(KEYS.requests, []);
}

/* ---------- LOGIN AND SESSION ---------- */

function login(event) {
  event.preventDefault();

  const role = $("login-role").value;
  const username = $("login-username").value.trim();
  const password = $("login-password").value;
  const error = $("login-error");

  let user = null;

  if (
    role === "admin" &&
    username === ADMIN_USERNAME &&
    password === ADMIN_PASSWORD
  ) {
    user = {
      id: "admin",
      name: "Administrator",
      username,
      role: "admin"
    };
  } else if (role !== "admin") {
    const account = accounts().find(account =>
      account.username.toLowerCase() === username.toLowerCase() &&
      account.password === password &&
      account.role === role &&
      account.active !== false
    );

    if (account) {
      user = {
        id: account.id,
        name: account.name,
        username: account.username,
        role: account.role,
        borrowerId: account.borrowerId
      };
    }
  }

  if (!user) {
    error.textContent = "Incorrect username, password, or account type.";
    return;
  }

  currentUser = user;
  sessionStorage.setItem(KEYS.session, JSON.stringify(user));

  // Retain compatibility with the previous admin login flag.
  if (role === "admin") {
    sessionStorage.setItem("schoolborrow_logged_in", "true");
  } else {
    sessionStorage.removeItem("schoolborrow_logged_in");
  }

  error.textContent = "";
  $("login-form").reset();
  startApplication();
}

function logout() {
  currentUser = null;
  currentPage = "";
  sessionStorage.removeItem(KEYS.session);
  sessionStorage.removeItem("schoolborrow_logged_in");

  $("app").classList.add("hidden");
  $("login-screen").classList.remove("hidden");
  $("login-error").textContent = "";
  $("login-username").value = "";
  $("login-password").value = "";
}

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEYS.session));
    if (saved && saved.role) {
      currentUser = saved;
      return true;
    }
  } catch {}

  // If the old version's admin login is still active in this browser session,
  // allow the administrator to continue without logging in again.
  if (sessionStorage.getItem("schoolborrow_logged_in") === "true") {
    currentUser = {
      id: "admin",
      name: "Administrator",
      username: ADMIN_USERNAME,
      role: "admin"
    };
    sessionStorage.setItem(KEYS.session, JSON.stringify(currentUser));
    return true;
  }

  return false;
}

/* ---------- NAVIGATION ---------- */

const NAVIGATION = {
  admin: [
    ["admin-dashboard", "▦", "Dashboard"],
    ["inventory", "▣", "Inventory"],
    ["borrowers", "♙", "Borrowers"],
    ["accounts", "♧", "User Accounts"],
    ["transactions", "↗", "Transactions"],
    ["requests", "◷", "Teacher Requests"]
  ],
  student: [
    ["student-catalog", "▣", "Available Items"],
    ["student-history", "◷", "My Borrowing History"]
  ],
  teacher: [
    ["teacher-catalog", "▣", "Available Items"],
    ["teacher-requests", "↗", "My Requests"],
    ["teacher-history", "◷", "My Borrowing History"]
  ]
};

const PAGE_TITLES = {
  "admin-dashboard": "Admin Dashboard",
  inventory: "Inventory Management",
  borrowers: "Borrower Management",
  accounts: "User Accounts",
  transactions: "Borrowing and Returns",
  requests: "Teacher Requests",
  "student-catalog": "Available School Items",
  "student-history": "My Borrowing History",
  "teacher-catalog": "Available School Items",
  "teacher-requests": "My Borrowing Requests",
  "teacher-history": "My Borrowing History"
};

function startApplication() {
  $("login-screen").classList.add("hidden");
  $("app").classList.remove("hidden");

  $("sidebar-name").textContent = currentUser.name;
  $("sidebar-role").textContent = roleName(currentUser.role);
  $("user-avatar").textContent = currentUser.name.charAt(0).toUpperCase();
  $("today-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  document.querySelectorAll(".welcome-name").forEach(element => {
    element.textContent = currentUser.name;
  });

  buildNavigation();

  const firstPage = NAVIGATION[currentUser.role][0][0];
  navigate(firstPage);
}

function buildNavigation() {
  $("navigation").innerHTML = NAVIGATION[currentUser.role].map(([page, icon, label]) => `
    <button class="nav-link" data-page="${page}">
      <span class="nav-icon">${icon}</span>
      <span>${label}</span>
    </button>
  `).join("");
}

function navigate(page) {
  const allowed = NAVIGATION[currentUser.role].some(entry => entry[0] === page);
  if (!allowed) return;

  currentPage = page;
  $("page-title").textContent = PAGE_TITLES[page] || "SchoolBorrow";

  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  const selected = $("page-" + page);
  if (selected) selected.classList.remove("hidden");

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  renderPage(page);
}

function renderPage(page) {
  if (page === "admin-dashboard") renderAdminDashboard();
  if (page === "inventory") renderInventory();
  if (page === "borrowers") renderBorrowers();
  if (page === "accounts") renderAccounts();
  if (page === "transactions") renderTransactions();
  if (page === "requests") renderAdminRequests();
  if (page === "student-catalog") renderCatalog("student");
  if (page === "teacher-catalog") renderCatalog("teacher");
  if (page === "student-history") renderPersonalHistory("student");
  if (page === "teacher-history") renderPersonalHistory("teacher");
  if (page === "teacher-requests") renderTeacherRequests();
}

/* ---------- ADMIN DASHBOARD ---------- */

function renderAdminDashboard() {
  const allItems = items();
  const allTransactions = transactions();
  const active = allTransactions.filter(t => !isReturned(t));
  const totalUnits = allItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const availableUnits = allItems.reduce((sum, item) => sum + Number(item.available || 0), 0);

  $("stat-items").textContent = allItems.length;
  $("stat-available").textContent = availableUnits;
  $("stat-borrowed").textContent = active.reduce((sum, t) => sum + Number(t.quantity || 0), 0);
  $("stat-overdue").textContent = active.filter(isOverdue).length;
  $("stat-borrowers").textContent = borrowers().length;
  $("stat-requests").textContent = requests().filter(r => r.status === "Pending").length;

  const recent = [...allTransactions].reverse().slice(0, 6);
  $("admin-recent-table").innerHTML = recent.length ? recent.map(t => `
    <tr>
      <td>${escapeHTML(getBorrowerName(t.borrowerId))}</td>
      <td>${escapeHTML(getItemName(t.itemId))}</td>
      <td>${Number(t.quantity)}</td>
      <td>${escapeHTML(t.borrowDate || "-")}</td>
      <td>${statusBadge(transactionStatus(t))}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="empty-row">No transactions recorded yet.</td></tr>`;

  const pending = requests().filter(r => r.status === "Pending").slice(0, 4);
  $("admin-pending-preview").innerHTML = pending.length ? pending.map(r => `
    <div class="preview-row">
      <div>
        <strong>${escapeHTML(r.teacherName)}</strong>
        <p>${escapeHTML(r.itemName)} · Qty ${Number(r.quantity)} · Needed ${escapeHTML(r.neededDate)}</p>
      </div>
      ${statusBadge("Pending")}
    </div>
  `).join("") : `<p class="muted">There are no pending teacher requests.</p>`;
}

/* ---------- INVENTORY ---------- */

function renderInventory() {
  const search = ($("inventory-search").value || "").toLowerCase();

  const filtered = items().filter(item =>
    `${item.name} ${item.category}`.toLowerCase().includes(search)
  );

  $("inventory-table").innerHTML = filtered.length ? filtered.map(item => {
    const borrowed = Number(item.quantity || 0) - Number(item.available || 0);
    return `
      <tr>
        <td><strong>${escapeHTML(item.name)}</strong></td>
        <td>${escapeHTML(item.category)}</td>
        <td>${Number(item.quantity)}</td>
        <td>${Number(item.available)}</td>
        <td>${Math.max(0, borrowed)}</td>
        <td><div class="table-actions">
          <button class="secondary-btn" data-action="edit-item" data-id="${escapeHTML(item.id)}">Edit</button>
          <button class="danger-btn" data-action="delete-item" data-id="${escapeHTML(item.id)}">Delete</button>
        </div></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="6" class="empty-row">No inventory items found.</td></tr>`;
}

function resetItemForm() {
  $("item-form").reset();
  $("item-id").value = "";
  $("item-submit").textContent = "Add item";
  $("item-cancel").classList.add("hidden");
}

function submitItem(event) {
  event.preventDefault();

  const id = $("item-id").value;
  const name = $("item-name").value.trim();
  const category = $("item-category").value.trim();
  const quantity = Number($("item-quantity").value);

  if (!name || !category || !Number.isInteger(quantity) || quantity < 0) {
    showToast("Please enter valid item information.", true);
    return;
  }

  const all = items();

  if (id) {
    const index = all.findIndex(item => String(item.id) === String(id));
    if (index < 0) return;

    const old = all[index];
    const borrowed = Number(old.quantity) - Number(old.available);

    if (quantity < borrowed) {
      showToast(`At least ${borrowed} units are currently borrowed.`, true);
      return;
    }

    all[index] = {
      ...old,
      name,
      category,
      quantity,
      available: quantity - borrowed
    };
    showToast("Inventory item updated.");
  } else {
    all.push({
      id: uid(),
      name,
      category,
      quantity,
      available: quantity
    });
    showToast("Inventory item added.");
  }

  save(KEYS.items, all);
  resetItemForm();
  renderInventory();
}

function editItem(id) {
  const item = getItem(id);
  if (!item) return;

  $("item-id").value = item.id;
  $("item-name").value = item.name;
  $("item-category").value = item.category;
  $("item-quantity").value = item.quantity;
  $("item-submit").textContent = "Save changes";
  $("item-cancel").classList.remove("hidden");
  $("item-name").focus();
}

function deleteItem(id) {
  const active = transactions().some(t =>
    String(t.itemId) === String(id) && !isReturned(t)
  );
  const pending = requests().some(r =>
    String(r.itemId) === String(id) && r.status === "Pending"
  );

  if (active || pending) {
    showToast("This item has active borrowing records or pending requests.", true);
    return;
  }

  if (!confirm("Delete this inventory item?")) return;

  save(KEYS.items, items().filter(item => String(item.id) !== String(id)));
  renderInventory();
  showToast("Item deleted.");
}

/* ---------- BORROWERS ---------- */

function renderBorrowers() {
  const search = ($("borrower-search").value || "").toLowerCase();
  const filtered = borrowers().filter(person =>
    `${person.name} ${person.type} ${person.contact || ""}`.toLowerCase().includes(search)
  );

  $("borrowers-table").innerHTML = filtered.length ? filtered.map(person => `
    <tr>
      <td><strong>${escapeHTML(person.name)}</strong></td>
      <td>${escapeHTML(person.type)}</td>
      <td>${escapeHTML(person.contact || "-")}</td>
      <td><button class="danger-btn" data-action="delete-borrower" data-id="${escapeHTML(person.id)}">Delete</button></td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="empty-row">No borrowers found.</td></tr>`;
}

function submitBorrower(event) {
  event.preventDefault();

  const name = $("borrower-name").value.trim();
  const type = $("borrower-type").value;
  const contact = $("borrower-contact").value.trim();

  if (!name) return;

  const all = borrowers();
  const duplicate = all.some(person =>
    person.name.toLowerCase() === name.toLowerCase() &&
    person.type.toLowerCase() === type.toLowerCase()
  );

  if (duplicate) {
    showToast("This borrower is already registered.", true);
    return;
  }

  all.push({ id: uid(), name, type, contact });
  save(KEYS.borrowers, all);
  $("borrower-form").reset();
  renderBorrowers();
  showToast("Borrower registered.");
}

function deleteBorrower(id) {
  const hasActive = transactions().some(t =>
    String(t.borrowerId) === String(id) && !isReturned(t)
  );
  const linkedAccount = accounts().some(a => String(a.borrowerId) === String(id));

  if (hasActive || linkedAccount) {
    showToast("This borrower has an account or an active borrowing record.", true);
    return;
  }

  if (!confirm("Delete this borrower?")) return;

  save(KEYS.borrowers, borrowers().filter(person => String(person.id) !== String(id)));
  renderBorrowers();
  showToast("Borrower deleted.");
}

/* ---------- USER ACCOUNTS ---------- */

function renderAccounts() {
  const list = accounts();

  $("accounts-table").innerHTML = list.length ? list.map(account => `
    <tr>
      <td><strong>${escapeHTML(account.name)}</strong></td>
      <td>${escapeHTML(account.username)}</td>
      <td>${escapeHTML(roleName(account.role))}</td>
      <td><button class="danger-btn" data-action="delete-account" data-id="${escapeHTML(account.id)}">Delete account</button></td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="empty-row">No student or teacher accounts created yet.</td></tr>`;
}

function submitAccount(event) {
  event.preventDefault();

  const name = $("account-name").value.trim();
  const role = $("account-role").value;
  const username = $("account-username").value.trim();
  const password = $("account-password").value;
  const contact = $("account-contact").value.trim();

  if (!name || !username || password.length < 4) {
    showToast("Complete all required fields. Password must be at least 4 characters.", true);
    return;
  }

  if (username.toLowerCase() === ADMIN_USERNAME ||
      accounts().some(a => a.username.toLowerCase() === username.toLowerCase())) {
    showToast("That username is already in use.", true);
    return;
  }

  // Link the login account to an existing borrower when possible.
  let borrower = borrowers().find(person =>
    person.name.toLowerCase() === name.toLowerCase() &&
    person.type.toLowerCase() === role
  );

  if (!borrower) {
    borrower = {
      id: uid(),
      name,
      type: roleName(role),
      contact
    };
    save(KEYS.borrowers, [...borrowers(), borrower]);
  } else if (contact && !borrower.contact) {
    save(KEYS.borrowers, borrowers().map(person =>
      String(person.id) === String(borrower.id)
        ? { ...person, contact }
        : person
    ));
  }

  const newAccount = {
    id: uid(),
    name,
    role,
    username,
    password,
    borrowerId: borrower.id,
    active: true,
    createdAt: today()
  };

  save(KEYS.accounts, [...accounts(), newAccount]);
  $("account-form").reset();
  renderAccounts();
  showToast(`${roleName(role)} account created successfully.`);
}

function deleteAccount(id) {
  if (!confirm("Delete this login account? Borrowing history will be kept.")) return;

  save(KEYS.accounts, accounts().filter(account => String(account.id) !== String(id)));
  renderAccounts();
  showToast("Account deleted. Borrowing history was preserved.");
}

/* ---------- BORROWING AND RETURNS ---------- */

function populateTransactionOptions() {
  const borrowerSelect = $("transaction-borrower");
  const itemSelect = $("transaction-item");

  const currentBorrower = borrowerSelect.value;
  const currentItem = itemSelect.value;

  borrowerSelect.innerHTML = `<option value="">Select borrower</option>` +
    borrowers().map(person => `
      <option value="${escapeHTML(person.id)}">${escapeHTML(person.name)} (${escapeHTML(person.type)})</option>
    `).join("");

  itemSelect.innerHTML = `<option value="">Select item</option>` +
    items().map(item => `
      <option value="${escapeHTML(item.id)}" ${Number(item.available) < 1 ? "disabled" : ""}>
        ${escapeHTML(item.name)} · Available: ${Number(item.available)}
      </option>
    `).join("");

  if (currentBorrower) borrowerSelect.value = currentBorrower;
  if (currentItem) itemSelect.value = currentItem;
}

function renderTransactions() {
  populateTransactionOptions();

  const search = ($("transaction-search").value || "").toLowerCase();
  const list = [...transactions()].reverse().filter(t => {
    const text = `${getBorrowerName(t.borrowerId)} ${getItemName(t.itemId)} ${t.status}`.toLowerCase();
    return text.includes(search);
  });

  $("transactions-table").innerHTML = list.length ? list.map(t => {
    const status = transactionStatus(t);
    return `
      <tr>
        <td>${escapeHTML(getBorrowerName(t.borrowerId))}</td>
        <td>${escapeHTML(getItemName(t.itemId))}</td>
        <td>${Number(t.quantity)}</td>
        <td>${escapeHTML(t.borrowDate || "-")}</td>
        <td>${escapeHTML(t.returnDate || "-")}</td>
        <td>${escapeHTML(t.actualReturnDate || "-")}</td>
        <td>
          ${statusBadge(status)}
          ${!isReturned(t) ? `<div class="table-actions" style="margin-top:7px">
            <button class="secondary-btn" data-action="return-item" data-id="${escapeHTML(t.id)}">Record return</button>
          </div>` : ""}
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7" class="empty-row">No transactions found.</td></tr>`;
}

function submitTransaction(event) {
  event.preventDefault();

  const borrowerId = $("transaction-borrower").value;
  const itemId = $("transaction-item").value;
  const quantity = Number($("transaction-quantity").value);
  const dueDate = $("transaction-due").value;

  const person = getBorrower(borrowerId);
  const item = getItem(itemId);

  if (!person || !item || !Number.isInteger(quantity) || quantity < 1 || !dueDate) {
    showToast("Please complete all borrowing details.", true);
    return;
  }

  if (dueDate < today()) {
    showToast("The expected return date cannot be in the past.", true);
    return;
  }

  if (quantity > Number(item.available)) {
    showToast("Not enough available stock.", true);
    return;
  }

  save(KEYS.items, items().map(entry =>
    String(entry.id) === String(itemId)
      ? { ...entry, available: Number(entry.available) - quantity }
      : entry
  ));

  const record = {
    id: uid(),
    borrowerId,
    itemId,
    quantity,
    borrowDate: today(),
    returnDate: dueDate,
    actualReturnDate: null,
    status: "Borrowed"
  };

  save(KEYS.transactions, [...transactions(), record]);
  $("transaction-form").reset();
  $("transaction-quantity").value = 1;
  renderTransactions();
  showToast("Borrowing recorded successfully.");
}

function returnTransaction(id) {
  const record = transactions().find(t => String(t.id) === String(id));
  if (!record || isReturned(record)) return;

  if (!confirm(`Record the return of ${getItemName(record.itemId)}?`)) return;

  save(KEYS.transactions, transactions().map(t =>
    String(t.id) === String(id)
      ? { ...t, actualReturnDate: today(), status: "Returned" }
      : t
  ));

  save(KEYS.items, items().map(item =>
    String(item.id) === String(record.itemId)
      ? {
          ...item,
          available: Math.min(
            Number(item.quantity),
            Number(item.available) + Number(record.quantity)
          )
        }
      : item
  ));

  renderTransactions();
  showToast("Return recorded. Inventory has been updated.");
}

/* ---------- TEACHER REQUESTS ---------- */

function openRequestModal(itemId) {
  const item = getItem(itemId);
  if (!item || Number(item.available) < 1) {
    showToast("This item is currently unavailable.", true);
    return;
  }

  $("request-item-id").value = item.id;
  $("request-item-label").textContent =
    `${item.name} · ${item.available} currently available`;
  $("request-quantity").value = 1;
  $("request-quantity").max = item.available;
  $("request-date").min = today();
  $("request-purpose").value = "";
  $("request-modal").classList.remove("hidden");
}

function closeRequestModal() {
  $("request-modal").classList.add("hidden");
}

function submitRequest(event) {
  event.preventDefault();

  const item = getItem($("request-item-id").value);
  const quantity = Number($("request-quantity").value);
  const neededDate = $("request-date").value;
  const purpose = $("request-purpose").value.trim();

  if (!item || !Number.isInteger(quantity) || quantity < 1 || !neededDate || !purpose) {
    showToast("Please complete all request details.", true);
    return;
  }

  if (neededDate < today()) {
    showToast("The needed date cannot be in the past.", true);
    return;
  }

  if (quantity > Number(item.available)) {
    showToast("The requested quantity is greater than the current available stock.", true);
    return;
  }

  const duplicate = requests().some(r =>
    String(r.teacherId) === String(currentUser.id) &&
    String(r.itemId) === String(item.id) &&
    r.status === "Pending"
  );

  if (duplicate) {
    showToast("You already have a pending request for this item.", true);
    return;
  }

  const request = {
    id: uid(),
    teacherId: currentUser.id,
    teacherName: currentUser.name,
    borrowerId: currentUser.borrowerId,
    itemId: item.id,
    itemName: item.name,
    quantity,
    requestedDate: today(),
    neededDate,
    purpose,
    status: "Pending"
  };

  save(KEYS.requests, [...requests(), request]);
  closeRequestModal();
  showToast("Your borrowing request was submitted.");
  if (currentPage === "teacher-requests") renderTeacherRequests();
}

function renderAdminRequests() {
  const list = [...requests()].reverse();

  $("requests-table").innerHTML = list.length ? list.map(request => `
    <tr>
      <td><strong>${escapeHTML(request.teacherName)}</strong></td>
      <td>${escapeHTML(request.itemName || getItemName(request.itemId))}</td>
      <td>${Number(request.quantity)}</td>
      <td>${escapeHTML(request.requestedDate)}</td>
      <td>${escapeHTML(request.neededDate)}</td>
      <td>${escapeHTML(request.purpose)}</td>
      <td>
        ${statusBadge(request.status)}
        ${request.status === "Pending" ? `
          <div class="table-actions" style="margin-top:7px">
            <button class="primary-btn" data-action="approve-request" data-id="${escapeHTML(request.id)}">Approve</button>
            <button class="danger-btn" data-action="reject-request" data-id="${escapeHTML(request.id)}">Reject</button>
          </div>` : ""}
      </td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="empty-row">No teacher requests yet.</td></tr>`;
}

function approveRequest(id) {
  const request = requests().find(r => String(r.id) === String(id));
  if (!request || request.status !== "Pending") return;

  const item = getItem(request.itemId);
  if (!item || Number(item.available) < Number(request.quantity)) {
    showToast("Not enough stock is available to approve this request.", true);
    return;
  }

  const borrower = getBorrower(request.borrowerId);
  if (!borrower) {
    showToast("The teacher's borrower record could not be found.", true);
    return;
  }

  if (!confirm(`Approve ${request.teacherName}'s request for ${request.quantity} × ${request.itemName}?`)) return;

  const dueDate = request.neededDate >= today()
    ? request.neededDate
    : today();

  save(KEYS.items, items().map(entry =>
    String(entry.id) === String(item.id)
      ? { ...entry, available: Number(entry.available) - Number(request.quantity) }
      : entry
  ));

  const transaction = {
    id: uid(),
    borrowerId: borrower.id,
    itemId: item.id,
    quantity: Number(request.quantity),
    borrowDate: today(),
    returnDate: dueDate,
    actualReturnDate: null,
    status: "Borrowed",
    requestId: request.id
  };

  save(KEYS.transactions, [...transactions(), transaction]);
  save(KEYS.requests, requests().map(r =>
    String(r.id) === String(id)
      ? { ...r, status: "Approved", approvedDate: today(), transactionId: transaction.id }
      : r
  ));

  renderAdminRequests();
  showToast("Request approved and borrowing recorded.");
}

function rejectRequest(id) {
  const request = requests().find(r => String(r.id) === String(id));
  if (!request || request.status !== "Pending") return;
  if (!confirm("Reject this teacher borrowing request?")) return;

  save(KEYS.requests, requests().map(r =>
    String(r.id) === String(id)
      ? { ...r, status: "Rejected", rejectedDate: today() }
      : r
  ));

  renderAdminRequests();
  showToast("Request rejected.");
}

function renderTeacherRequests() {
  const list = requests()
    .filter(r => String(r.teacherId) === String(currentUser.id))
    .reverse();

  $("teacher-requests-table").innerHTML = list.length ? list.map(r => `
    <tr>
      <td>${escapeHTML(r.itemName || getItemName(r.itemId))}</td>
      <td>${Number(r.quantity)}</td>
      <td>${escapeHTML(r.requestedDate)}</td>
      <td>${escapeHTML(r.neededDate)}</td>
      <td>${escapeHTML(r.purpose)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="empty-row">You haven't submitted any requests.</td></tr>`;
}

/* ---------- STUDENT AND TEACHER CATALOG ---------- */

function renderCatalog(role) {
  const searchId = role + "-search";
  const containerId = role + "-catalog";
  const search = ($(searchId).value || "").toLowerCase();

  const filtered = items().filter(item =>
    `${item.name} ${item.category}`.toLowerCase().includes(search)
  );

  $(containerId).innerHTML = filtered.length ? filtered.map(item => {
    const available = Number(item.available) > 0;
    const action = role === "teacher"
      ? `<button class="primary-btn" data-action="request-item" data-id="${escapeHTML(item.id)}" ${!available ? "disabled" : ""}>Request item</button>`
      : `<span class="muted">Please visit the administrator to borrow this item.</span>`;

    return `
      <article class="item-card">
        <div class="item-symbol">📦</div>
        <h3>${escapeHTML(item.name)}</h3>
        <p>${escapeHTML(item.category)}</p>
        <div class="item-quantity">${available ? `${Number(item.available)} available` : "Currently unavailable"}</div>
        ${statusBadge(available ? "Available" : "Unavailable")}
        <div style="margin-top:14px">${action}</div>
      </article>
    `;
  }).join("") : `<p class="muted">No matching school items found.</p>`;
}

/* ---------- PERSONAL HISTORY ---------- */

function getMyTransactions(role) {
  const account = getAccount(currentUser.id);
  const borrowerId = currentUser.borrowerId || account?.borrowerId;

  if (!borrowerId) return [];

  return transactions()
    .filter(t => String(t.borrowerId) === String(borrowerId))
    .reverse();
}

function renderPersonalHistory(role) {
  const tableId = role + "-history-table";
  const list = getMyTransactions(role);

  $(tableId).innerHTML = list.length ? list.map(t => `
    <tr>
      <td>${escapeHTML(getItemName(t.itemId))}</td>
      <td>${Number(t.quantity)}</td>
      <td>${escapeHTML(t.borrowDate || "-")}</td>
      <td>${escapeHTML(t.returnDate || "-")}</td>
      <td>${escapeHTML(t.actualReturnDate || "-")}</td>
      <td>${statusBadge(transactionStatus(t))}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="empty-row">No borrowing history yet.</td></tr>`;
}

/* ---------- CSV EXPORT ---------- */

function exportTransactions() {
  const rows = [
    ["Borrower", "Item", "Quantity", "Borrow Date", "Due Date", "Actual Return Date", "Status"],
    ...transactions().map(t => [
      getBorrowerName(t.borrowerId),
      getItemName(t.itemId),
      t.quantity,
      t.borrowDate || "",
      t.returnDate || "",
      t.actualReturnDate || "",
      transactionStatus(t)
    ])
  ];

  const csv = rows.map(row =>
    row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "schoolborrow-transactions.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Transaction report exported.");
}

/* ---------- EVENT LISTENERS ---------- */

$("login-form").addEventListener("submit", login);
$("logout-btn").addEventListener("click", logout);
$("item-form").addEventListener("submit", submitItem);
$("item-cancel").addEventListener("click", resetItemForm);
$("borrower-form").addEventListener("submit", submitBorrower);
$("account-form").addEventListener("submit", submitAccount);
$("transaction-form").addEventListener("submit", submitTransaction);
$("request-form").addEventListener("submit", submitRequest);
$("request-close").addEventListener("click", closeRequestModal);
$("export-btn").addEventListener("click", exportTransactions);

$("request-modal").addEventListener("click", event => {
  if (event.target === $("request-modal")) closeRequestModal();
});

$("inventory-search").addEventListener("input", renderInventory);
$("borrower-search").addEventListener("input", renderBorrowers);
$("transaction-search").addEventListener("input", renderTransactions);
$("student-search").addEventListener("input", () => renderCatalog("student"));
$("teacher-search").addEventListener("input", () => renderCatalog("teacher"));

$("navigation").addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) navigate(button.dataset.page);
});

document.addEventListener("click", event => {
  const goButton = event.target.closest("[data-go]");
  if (goButton) {
    navigate(goButton.dataset.go);
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  switch (action) {
    case "edit-item":
      editItem(id);
      break;
    case "delete-item":
      deleteItem(id);
      break;
    case "delete-borrower":
      deleteBorrower(id);
      break;
    case "delete-account":
      deleteAccount(id);
      break;
    case "return-item":
      returnTransaction(id);
      break;
    case "request-item":
      openRequestModal(id);
      break;
    case "approve-request":
      approveRequest(id);
      break;
    case "reject-request":
      rejectRequest(id);
      break;
  }
});

/* ---------- STARTUP ---------- */

initializeData();

if (restoreSession()) {
  startApplication();
} else {
  $("login-screen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

// Set date minimums to today.
$("transaction-due").min = today();
$("request-date").min = today();
