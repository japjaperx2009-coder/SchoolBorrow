
/* =========================================
   SCHOOLBORROW
   Supabase-connected borrowing management
   ========================================= */

const SUPABASE_URL = "https://uhkjktacwmcqywvlblcn.supabase.co";
const SUPABASE_KEY = "sb_publishable_3Xt-YOdM7xXUYMLr8B4t5w_niq7y4g9";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const KEYS = {
  session: "sb_session"
};

const ADMIN_USERNAME = "admin";

let currentUser = null;
let currentPage = "";
let toastTimer = null;

let data = {
  items: [],
  borrowers: [],
  transactions: [],
  accounts: [],
  requests: []
};

const $ = id => document.getElementById(id);

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
  return String(role || "").charAt(0).toUpperCase() +
    String(role || "").slice(1);
}

function items() { return data.items; }
function borrowers() { return data.borrowers; }
function transactions() { return data.transactions; }
function accounts() { return data.accounts; }
function requests() { return data.requests; }

function getItem(id) {
  return items().find(x => String(x.id) === String(id));
}

function getBorrower(id) {
  return borrowers().find(x => String(x.id) === String(id));
}

function getAccount(id) {
  return accounts().find(x => String(x.id) === String(id));
}

function getItemName(id) {
  return getItem(id)?.name || "Deleted item";
}

function getBorrowerName(id) {
  return getBorrower(id)?.name || "Unknown borrower";
}

function isReturned(t) {
  return String(t.status).toLowerCase() === "returned";
}

function isOverdue(t) {
  return !isReturned(t) && t.returnDate && t.returnDate < today();
}

function transactionStatus(t) {
  if (isReturned(t)) return "Returned";
  if (isOverdue(t)) return "Overdue";
  return "Borrowed";
}

function statusBadge(status) {
  const value = String(status).toLowerCase();
  return `<span class="status ${escapeHTML(value)}">${escapeHTML(status)}</span>`;
}

function showToast(message, error = false) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = "toast show" + (error ? " error" : "");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function showError(error, fallback = "Something went wrong.") {
  console.error(error);
  showToast(error?.message || fallback, true);
}

/* ---------- DATABASE DATA ---------- */

async function refreshData() {
  const results = await Promise.all([
    db.from("inventory_items").select("*").order("created_at"),
    db.from("borrowers").select("*").order("created_at"),
    db.from("borrowing_transactions").select("*").order("created_at"),
    db.from("profiles").select("*").order("created_at"),
    db.from("borrowing_requests").select("*").order("created_at")
  ]);

  for (const result of results) {
    if (result.error) throw result.error;
  }

  data.items = results[0].data.map(x => ({
    id: x.id,
    name: x.name,
    category: x.category,
    quantity: Number(x.quantity),
    available: Number(x.available)
  }));

  data.borrowers = results[1].data.map(x => ({
    id: x.id,
    name: x.name,
    type: x.type,
    contact: x.contact || ""
  }));

  data.transactions = results[2].data.map(x => ({
    id: x.id,
    borrowerId: x.borrower_id,
    itemId: x.item_id,
    quantity: Number(x.quantity),
    borrowDate: x.borrow_date,
    returnDate: x.return_date,
    actualReturnDate: x.actual_return_date,
    status: x.status,
    requestId: x.request_id
  }));

  data.accounts = results[3].data
    .filter(x => x.role !== "admin")
    .map(x => ({
      id: x.id,
      name: x.full_name,
      username: x.username || "",
      role: x.role,
      borrowerId: x.borrower_id
    }));

  data.requests = results[4].data.map(x => ({
    id: x.id,
    teacherId: x.teacher_id,
    teacherName: x.teacher_name,
    borrowerId: x.borrower_id,
    itemId: x.item_id,
    itemName: x.item_name,
    quantity: Number(x.quantity),
    requestedDate: x.requested_date,
    neededDate: x.needed_date,
    purpose: x.purpose,
    status: x.status,
    approvedDate: x.approved_date,
    rejectedDate: x.rejected_date,
    transactionId: x.transaction_id
  }));
}

/* ---------- LOGIN AND SESSION ---------- */

async function login(event) {
  event.preventDefault();

  const role = $("login-role").value;
  const username = $("login-username").value.trim().toLowerCase();
  const password = $("login-password").value;
  const error = $("login-error");

  error.textContent = "";

  if (!username || !password) {
    error.textContent = "Enter your username and password.";
    return;
  }

  const email = username === ADMIN_USERNAME
    ? "admin@schoolborrow.local"
    : `${username}@schoolborrow.local`;

  try {
    const { data: authData, error: authError } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (authError) throw authError;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    if (profileError) throw profileError;

    if (profile.role !== role) {
      await db.auth.signOut();
      error.textContent = "Incorrect username, password, or account type.";
      return;
    }

    currentUser = {
      id: authData.user.id,
      name: profile.full_name,
      username: profile.username || username,
      role: profile.role,
      borrowerId: profile.borrower_id
    };

    await refreshData();

    $("login-form").reset();
    startApplication();

  } catch (err) {
    console.error(err);
    error.textContent =
      err.message === "Invalid login credentials"
        ? "Incorrect username, password, or account type."
        : err.message || "Login failed.";
  }
}

async function logout() {
  try {
    await db.auth.signOut();
  } catch (err) {
    console.error(err);
  }

  currentUser = null;
  currentPage = "";
  data = {
    items: [],
    borrowers: [],
    transactions: [],
    accounts: [],
    requests: []
  };

  $("app").classList.add("hidden");
  $("login-screen").classList.remove("hidden");
  $("login-error").textContent = "";
  $("login-username").value = "";
  $("login-password").value = "";
}

async function restoreSession() {
  try {
    const { data: sessionData, error } = await db.auth.getSession();

    if (error || !sessionData.session) return false;

    const user = sessionData.session.user;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      await db.auth.signOut();
      return false;
    }

    currentUser = {
      id: user.id,
      name: profile.full_name,
      username: profile.username || "",
      role: profile.role,
      borrowerId: profile.borrower_id
    };

    await refreshData();
    return true;

  } catch (err) {
    console.error(err);
    return false;
  }
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
  $("user-avatar").textContent =
    currentUser.name.charAt(0).toUpperCase();

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
  navigate(NAVIGATION[currentUser.role][0][0]);
}

function buildNavigation() {
  $("navigation").innerHTML =
    NAVIGATION[currentUser.role].map(([page, icon, label]) => `
      <button class="nav-link" data-page="${page}">
        <span class="nav-icon">${icon}</span>
        <span>${label}</span>
      </button>
    `).join("");
}

function navigate(page) {
  if (!currentUser) return;

  const allowed = NAVIGATION[currentUser.role]
    .some(entry => entry[0] === page);

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

  const availableUnits = allItems.reduce(
    (sum, item) => sum + Number(item.available || 0), 0
  );

  $("stat-items").textContent = allItems.length;
  $("stat-available").textContent = availableUnits;
  $("stat-borrowed").textContent = active.reduce(
    (sum, t) => sum + Number(t.quantity || 0), 0
  );
  $("stat-overdue").textContent = active.filter(isOverdue).length;
  $("stat-borrowers").textContent = borrowers().length;
  $("stat-requests").textContent =
    requests().filter(r => r.status === "Pending").length;

  const recent = [...allTransactions].reverse().slice(0, 6);

  $("admin-recent-table").innerHTML = recent.length
    ? recent.map(t => `
      <tr>
        <td>${escapeHTML(getBorrowerName(t.borrowerId))}</td>
        <td>${escapeHTML(getItemName(t.itemId))}</td>
        <td>${Number(t.quantity)}</td>
        <td>${escapeHTML(t.borrowDate || "-")}</td>
        <td>${statusBadge(transactionStatus(t))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="empty-row">No transactions recorded yet.</td></tr>`;

  const pending = requests()
    .filter(r => r.status === "Pending")
    .slice(0, 4);

  $("admin-pending-preview").innerHTML = pending.length
    ? pending.map(r => `
      <div class="preview-row">
        <div>
          <strong>${escapeHTML(r.teacherName)}</strong>
          <p>${escapeHTML(r.itemName)} · Qty ${Number(r.quantity)} · Needed ${escapeHTML(r.neededDate)}</p>
        </div>
        ${statusBadge("Pending")}
      </div>
    `).join("")
    : `<p class="muted">There are no pending teacher requests.</p>`;
}

/* ---------- INVENTORY ---------- */

function renderInventory() {
  const search = ($("inventory-search").value || "").toLowerCase();

  const filtered = items().filter(item =>
    `${item.name} ${item.category}`.toLowerCase().includes(search)
  );

  $("inventory-table").innerHTML = filtered.length
    ? filtered.map(item => {
      const borrowed = Number(item.quantity) - Number(item.available);

      return `
        <tr>
          <td><strong>${escapeHTML(item.name)}</strong></td>
          <td>${escapeHTML(item.category)}</td>
          <td>${Number(item.quantity)}</td>
          <td>${Number(item.available)}</td>
          <td>${Math.max(0, borrowed)}</td>
          <td>
            <div class="table-actions">
              <button class="secondary-btn" data-action="edit-item" data-id="${escapeHTML(item.id)}">Edit</button>
              <button class="danger-btn" data-action="delete-item" data-id="${escapeHTML(item.id)}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="6" class="empty-row">No inventory items found.</td></tr>`;
}

function resetItemForm() {
  $("item-form").reset();
  $("item-id").value = "";
  $("item-submit").textContent = "Add item";
  $("item-cancel").classList.add("hidden");
}

async function submitItem(event) {
  event.preventDefault();

  const id = $("item-id").value;
  const name = $("item-name").value.trim();
  const category = $("item-category").value.trim();
  const quantity = Number($("item-quantity").value);

  if (!name || !category || !Number.isInteger(quantity) || quantity < 0) {
    showToast("Please enter valid item information.", true);
    return;
  }

  try {
    if (id) {
      const old = getItem(id);
      if (!old) return;

      const borrowed = Number(old.quantity) - Number(old.available);

      if (quantity < borrowed) {
        showToast(`At least ${borrowed} units are currently borrowed.`, true);
        return;
      }

      const { error } = await db.from("inventory_items")
        .update({
          name,
          category,
          quantity,
          available: quantity - borrowed
        })
        .eq("id", id);

      if (error) throw error;
      showToast("Inventory item updated.");

    } else {
      const { error } = await db.from("inventory_items").insert({
        name,
        category,
        quantity,
        available: quantity
      });

      if (error) throw error;
      showToast("Inventory item added.");
    }

    await refreshData();
    resetItemForm();
    renderInventory();

  } catch (err) {
    showError(err, "Could not save inventory item.");
  }
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

async function deleteItem(id) {
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

  try {
    const { error } = await db.from("inventory_items")
      .delete().eq("id", id);

    if (error) throw error;

    await refreshData();
    renderInventory();
    showToast("Item deleted.");

  } catch (err) {
    showError(err, "Could not delete item.");
  }
}

/* ---------- BORROWERS ---------- */

function renderBorrowers() {
  const search = ($("borrower-search").value || "").toLowerCase();

  const filtered = borrowers().filter(person =>
    `${person.name} ${person.type} ${person.contact || ""}`
      .toLowerCase().includes(search)
  );

  $("borrowers-table").innerHTML = filtered.length
    ? filtered.map(person => `
      <tr>
        <td><strong>${escapeHTML(person.name)}</strong></td>
        <td>${escapeHTML(person.type)}</td>
        <td>${escapeHTML(person.contact || "-")}</td>
        <td>
          <button class="danger-btn" data-action="delete-borrower" data-id="${escapeHTML(person.id)}">Delete</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="empty-row">No borrowers found.</td></tr>`;
}

async function submitBorrower(event) {
  event.preventDefault();

  const name = $("borrower-name").value.trim();
  const type = $("borrower-type").value;
  const contact = $("borrower-contact").value.trim();

  if (!name) return;

  const duplicate = borrowers().some(person =>
    person.name.toLowerCase() === name.toLowerCase() &&
    person.type.toLowerCase() === type.toLowerCase()
  );

  if (duplicate) {
    showToast("This borrower is already registered.", true);
    return;
  }

  try {
    const { error } = await db.from("borrowers").insert({
      name,
      type,
      contact
    });

    if (error) throw error;

    await refreshData();
    $("borrower-form").reset();
    renderBorrowers();
    showToast("Borrower registered.");

  } catch (err) {
    showError(err, "Could not register borrower.");
  }
}

async function deleteBorrower(id) {
  const hasActive = transactions().some(t =>
    String(t.borrowerId) === String(id) && !isReturned(t)
  );

  const linkedAccount = accounts().some(a =>
    String(a.borrowerId) === String(id)
  );

  if (hasActive || linkedAccount) {
    showToast("This borrower has an account or an active borrowing record.", true);
    return;
  }

  if (!confirm("Delete this borrower?")) return;

  try {
    const { error } = await db.from("borrowers")
      .delete().eq("id", id);

    if (error) throw error;

    await refreshData();
    renderBorrowers();
    showToast("Borrower deleted.");

  } catch (err) {
    showError(err, "Could not delete borrower.");
  }
}

/* ---------- USER ACCOUNTS ---------- */

function renderAccounts() {
  const list = accounts();

  $("accounts-table").innerHTML = list.length
    ? list.map(account => `
      <tr>
        <td><strong>${escapeHTML(account.name)}</strong></td>
        <td>${escapeHTML(account.username)}</td>
        <td>${escapeHTML(roleName(account.role))}</td>
        <td><span class="muted">Managed through Supabase</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="empty-row">No student or teacher accounts created yet.</td></tr>`;
}

async function submitAccount(event) {
  event.preventDefault();

  const name = $("account-name").value.trim();
  const role = $("account-role").value;
  const username = $("account-username").value.trim().toLowerCase();
  const password = $("account-password").value;
  const contact = $("account-contact").value.trim();

  if (!name || !username || password.length < 8) {
    showToast("Complete all fields. Password must be at least 8 characters.", true);
    return;
  }

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    showToast("Username must be 3-30 characters using letters, numbers, or underscores.", true);
    return;
  }

  if (username === ADMIN_USERNAME ||
      accounts().some(a => a.username.toLowerCase() === username)) {
    showToast("That username is already in use.", true);
    return;
  }

  try {
    const { data: result, error } = await db.functions.invoke(
      "admin-create-user",
      {
        body: {
          username,
          password,
          full_name: name,
          role,
          contact
        }
      }
    );

    if (error) throw error;
    if (result?.error) throw new Error(result.error);

    await refreshData();
    $("account-form").reset();
    renderAccounts();
    showToast(`${roleName(role)} account created successfully.`);

  } catch (err) {
    showError(err, "Could not create account.");
  }
}

/* ---------- BORROWING AND RETURNS ---------- */

function populateTransactionOptions() {
  const borrowerSelect = $("transaction-borrower");
  const itemSelect = $("transaction-item");

  const currentBorrower = borrowerSelect.value;
  const currentItem = itemSelect.value;

  borrowerSelect.innerHTML =
    `<option value="">Select borrower</option>` +
    borrowers().map(person => `
      <option value="${escapeHTML(person.id)}">
        ${escapeHTML(person.name)} (${escapeHTML(person.type)})
      </option>
    `).join("");

  itemSelect.innerHTML =
    `<option value="">Select item</option>` +
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
    const text =
      `${getBorrowerName(t.borrowerId)} ${getItemName(t.itemId)} ${t.status}`
        .toLowerCase();

    return text.includes(search);
  });

  $("transactions-table").innerHTML = list.length
    ? list.map(t => {
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
            ${!isReturned(t) ? `
              <div class="table-actions" style="margin-top:7px">
                <button class="secondary-btn" data-action="return-item" data-id="${escapeHTML(t.id)}">Record return</button>
              </div>
            ` : ""}
          </td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="7" class="empty-row">No transactions found.</td></tr>`;
}

async function submitTransaction(event) {
  event.preventDefault();

  const borrowerId = $("transaction-borrower").value;
  const itemId = $("transaction-item").value;
  const quantity = Number($("transaction-quantity").value);
  const dueDate = $("transaction-due").value;

  const person = getBorrower(borrowerId);
  const item = getItem(itemId);

  if (!person || !item || !Number.isInteger(quantity) ||
      quantity < 1 || !dueDate) {
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

  try {
    const { error: stockError } = await db
      .from("inventory_items")
      .update({ available: Number(item.available) - quantity })
      .eq("id", itemId);

    if (stockError) throw stockError;

    const { error: transactionError } = await db
      .from("borrowing_transactions")
      .insert({
        borrower_id: borrowerId,
        item_id: itemId,
        quantity,
        borrow_date: today(),
        return_date: dueDate,
        actual_return_date: null,
        status: "Borrowed"
      });

    if (transactionError) {
      await db.from("inventory_items")
        .update({ available: Number(item.available) })
        .eq("id", itemId);

      throw transactionError;
    }

    await refreshData();

    $("transaction-form").reset();
    $("transaction-quantity").value = 1;
    renderTransactions();
    showToast("Borrowing recorded successfully.");

  } catch (err) {
    showError(err, "Could not record borrowing.");
  }
}

async function returnTransaction(id) {
  const record = transactions().find(t => String(t.id) === String(id));
  if (!record || isReturned(record)) return;

  if (!confirm(`Record the return of ${getItemName(record.itemId)}?`)) return;

  const item = getItem(record.itemId);
  if (!item) {
    showToast("The inventory item could not be found.", true);
    return;
  }

  try {
    const { error: transactionError } = await db
      .from("borrowing_transactions")
      .update({
        actual_return_date: today(),
        status: "Returned"
      })
      .eq("id", id);

    if (transactionError) throw transactionError;

    const { error: stockError } = await db
      .from("inventory_items")
      .update({
        available: Math.min(
          Number(item.quantity),
          Number(item.available) + Number(record.quantity)
        )
      })
      .eq("id", item.id);

    if (stockError) throw stockError;

    await refreshData();
    renderTransactions();
    showToast("Return recorded. Inventory has been updated.");

  } catch (err) {
    showError(err, "Could not record return.");
  }
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

async function submitRequest(event) {
  event.preventDefault();

  const item = getItem($("request-item-id").value);
  const quantity = Number($("request-quantity").value);
  const neededDate = $("request-date").value;
  const purpose = $("request-purpose").value.trim();

  if (!item || !Number.isInteger(quantity) || quantity < 1 ||
      !neededDate || !purpose) {
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

  try {
    const { error } = await db.from("borrowing_requests").insert({
      teacher_id: currentUser.id,
      teacher_name: currentUser.name,
      borrower_id: currentUser.borrowerId,
      item_id: item.id,
      item_name: item.name,
      quantity,
      requested_date: today(),
      needed_date: neededDate,
      purpose,
      status: "Pending"
    });

    if (error) throw error;

    await refreshData();
    closeRequestModal();
    showToast("Your borrowing request was submitted.");

    if (currentPage === "teacher-requests") {
      renderTeacherRequests();
    }

  } catch (err) {
    showError(err, "Could not submit request.");
  }
}

function renderAdminRequests() {
  const list = [...requests()].reverse();

  $("requests-table").innerHTML = list.length
    ? list.map(request => `
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
            </div>
          ` : ""}
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="empty-row">No teacher requests yet.</td></tr>`;
}

async function approveRequest(id) {
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

  if (!confirm(
    `Approve ${request.teacherName}'s request for ${request.quantity} × ${request.itemName}?`
  )) return;

  try {
    const dueDate = request.neededDate >= today()
      ? request.neededDate
      : today();

    const { error: stockError } = await db
      .from("inventory_items")
      .update({
        available: Number(item.available) - Number(request.quantity)
      })
      .eq("id", item.id);

    if (stockError) throw stockError;

    const { data: transaction, error: transactionError } = await db
      .from("borrowing_transactions")
      .insert({
        borrower_id: borrower.id,
        item_id: item.id,
        quantity: Number(request.quantity),
        borrow_date: today(),
        return_date: dueDate,
        actual_return_date: null,
        status: "Borrowed",
        request_id: request.id
      })
      .select()
      .single();

    if (transactionError) {
      await db.from("inventory_items")
        .update({ available: Number(item.available) })
        .eq("id", item.id);

      throw transactionError;
    }

    const { error: requestError } = await db
      .from("borrowing_requests")
      .update({
        status: "Approved",
        approved_date: new Date().toISOString(),
        transaction_id: transaction.id
      })
      .eq("id", id);

    if (requestError) throw requestError;

    await refreshData();
    renderAdminRequests();
    showToast("Request approved and borrowing recorded.");

  } catch (err) {
    showError(err, "Could not approve request.");
  }
}

async function rejectRequest(id) {
  const request = requests().find(r => String(r.id) === String(id));
  if (!request || request.status !== "Pending") return;

  if (!confirm("Reject this teacher borrowing request?")) return;

  try {
    const { error } = await db
      .from("borrowing_requests")
      .update({
        status: "Rejected",
        rejected_date: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;

    await refreshData();
    renderAdminRequests();
    showToast("Request rejected.");

  } catch (err) {
    showError(err, "Could not reject request.");
  }
}

function renderTeacherRequests() {
  const list = requests()
    .filter(r => String(r.teacherId) === String(currentUser.id))
    .reverse();

  $("teacher-requests-table").innerHTML = list.length
    ? list.map(r => `
      <tr>
        <td>${escapeHTML(r.itemName || getItemName(r.itemId))}</td>
        <td>${Number(r.quantity)}</td>
        <td>${escapeHTML(r.requestedDate)}</td>
        <td>${escapeHTML(r.neededDate)}</td>
        <td>${escapeHTML(r.purpose)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty-row">You haven't submitted any requests.</td></tr>`;
}

/* ---------- STUDENT AND TEACHER CATALOG ---------- */

function renderCatalog(role) {
  const searchId = role + "-search";
  const containerId = role + "-catalog";
  const search = ($(searchId).value || "").toLowerCase();

  const filtered = items().filter(item =>
    `${item.name} ${item.category}`.toLowerCase().includes(search)
  );

  $(containerId).innerHTML = filtered.length
    ? filtered.map(item => {
      const available = Number(item.available) > 0;

      const action = role === "teacher"
        ? `<button class="primary-btn" data-action="request-item" data-id="${escapeHTML(item.id)}" ${!available ? "disabled" : ""}>Request item</button>`
        : `<span class="muted">Please visit the administrator to borrow this item.</span>`;

      return `
        <article class="item-card">
          <div class="item-symbol">📦</div>
          <h3>${escapeHTML(item.name)}</h3>
          <p>${escapeHTML(item.category)}</p>
          <div class="item-quantity">
            ${available ? `${Number(item.available)} available` : "Currently unavailable"}
          </div>
          ${statusBadge(available ? "Available" : "Unavailable")}
          <div style="margin-top:14px">${action}</div>
        </article>
      `;
    }).join("")
    : `<p class="muted">No matching school items found.</p>`;
}

/* ---------- PERSONAL HISTORY ---------- */

function getMyTransactions() {
  const borrowerId = currentUser.borrowerId;
  if (!borrowerId) return [];

  return transactions()
    .filter(t => String(t.borrowerId) === String(borrowerId))
    .reverse();
}

function renderPersonalHistory(role) {
  const tableId = role + "-history-table";
  const list = getMyTransactions();

  $(tableId).innerHTML = list.length
    ? list.map(t => `
      <tr>
        <td>${escapeHTML(getItemName(t.itemId))}</td>
        <td>${Number(t.quantity)}</td>
        <td>${escapeHTML(t.borrowDate || "-")}</td>
        <td>${escapeHTML(t.returnDate || "-")}</td>
        <td>${escapeHTML(t.actualReturnDate || "-")}</td>
        <td>${statusBadge(transactionStatus(t))}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty-row">No borrowing history yet.</td></tr>`;
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
    row.map(value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(",")
  ).join("\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

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

async function initializeApplication() {
  $("login-screen").classList.remove("hidden");
  $("app").classList.add("hidden");

  $("transaction-due").min = today();
  $("request-date").min = today();

  const restored = await restoreSession();

  if (restored) {
    startApplication();
  }
}

initializeApplication();
