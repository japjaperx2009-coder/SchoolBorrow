
// SCHOOLBORROW MANAGEMENT SYSTEM

// DEMO ADMIN CREDENTIALS
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "school123";

// STORAGE
let items = JSON.parse(localStorage.getItem("sb_items")) || [];
let borrowers = JSON.parse(localStorage.getItem("sb_borrowers")) || [];
let transactions = JSON.parse(localStorage.getItem("sb_transactions")) || [];

const $ = id => document.getElementById(id);

function saveData() {
    localStorage.setItem("sb_items", JSON.stringify(items));
    localStorage.setItem("sb_borrowers", JSON.stringify(borrowers));
    localStorage.setItem("sb_transactions", JSON.stringify(transactions));
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function makeId(prefix) {
    return prefix + Date.now().toString().slice(-8) +
        Math.floor(Math.random() * 100);
}

// LOGIN SYSTEM

function showLogin() {
    document.body.classList.add("logged-out");
    $("login-screen").style.display = "flex";
}

function showDashboard() {
    document.body.classList.remove("logged-out");
    $("login-screen").style.display = "none";
    showPage("dashboard");
}

$("login-form").addEventListener("submit", function(event) {
    event.preventDefault();

    const username = $("username").value.trim();
    const password = $("password").value;

    if (
        username === ADMIN_USERNAME &&
        password === ADMIN_PASSWORD
    ) {
        sessionStorage.setItem("schoolborrow_logged_in", "true");
        $("login-error").textContent = "";
        $("login-form").reset();
        showDashboard();
    } else {
        $("login-error").textContent =
            "Incorrect username or password.";
    }
});

$("logout-btn").addEventListener("click", function() {
    sessionStorage.removeItem("schoolborrow_logged_in");
    $("login-form").reset();
    showLogin();
});

// NAVIGATION

function showPage(page) {
    document.querySelectorAll(".page").forEach(section => {
        section.classList.remove("active");
    });

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.remove("active");
    });

    $(page).classList.add("active");

    const navButton = document.querySelector(
        `.nav-btn[data-page="${page}"]`
    );

    if (navButton) navButton.classList.add("active");

    const titles = {
        dashboard: "Dashboard",
        inventory: "Inventory",
        borrowers: "Borrowers",
        transactions: "Transactions"
    };

    $("page-title").textContent = titles[page];
    renderAll();
}

document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

// MODAL

function openModal(title, fields, onSubmit) {
    $("modal-title").textContent = title;

    $("modal-form").innerHTML = fields.map(field => `
        <label for="${field.id}">${escapeHTML(field.label)}</label>
        ${
            field.options
            ? `<select id="${field.id}" required>
                ${field.options.map(option =>
                    `<option value="${escapeHTML(option.value)}">
                        ${escapeHTML(option.label)}
                    </option>`
                ).join("")}
               </select>`
            : `<input id="${field.id}" type="${field.type || "text"}"
                placeholder="${escapeHTML(field.placeholder || "")}"
                ${field.min !== undefined ? `min="${field.min}"` : ""}
                ${field.required === false ? "" : "required"}>`
        }
    `).join("") + `
        <button type="submit">Save Record</button>
    `;

    $("modal").classList.add("show");

    $("modal-form").onsubmit = event => {
        event.preventDefault();

        const values = {};

        fields.forEach(field => {
            values[field.id] = $(field.id).value.trim();
        });

        onSubmit(values);
        closeModal();
    };
}

function closeModal() {
    $("modal").classList.remove("show");
}

$("close-modal").addEventListener("click", closeModal);

$("modal").addEventListener("click", event => {
    if (event.target === $("modal")) closeModal();
});

// INVENTORY

function addItem() {
    openModal("Add School Item", [
        { id: "name", label: "Item Name" },
        { id: "category", label: "Category" },
        {
            id: "quantity",
            label: "Total Quantity",
            type: "number",
            min: 1
        }
    ], values => {
        const quantity = Number(values.quantity);

        if (!Number.isSafeInteger(quantity) || quantity < 1) {
            alert("Enter a valid quantity.");
            return;
        }

        items.push({
            id: makeId("ITM-"),
            name: values.name,
            category: values.category,
            quantity,
            available: quantity
        });

        saveData();
        renderAll();
    });
}

function editItem(id) {
    const item = items.find(item => item.id === id);
    if (!item) return;

    openModal("Edit School Item", [
        { id: "name", label: "Item Name" },
        { id: "category", label: "Category" },
        {
            id: "quantity",
            label: "Total Quantity",
            type: "number",
            min: 1
        }
    ], values => {
        const quantity = Number(values.quantity);

        if (
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity < item.quantity - item.available
        ) {
            alert("Quantity cannot be lower than the number currently borrowed.");
            return;
        }

        const borrowed = item.quantity - item.available;

        item.name = values.name;
        item.category = values.category;
        item.quantity = quantity;
        item.available = quantity - borrowed;

        saveData();
        renderAll();
    });

    $("name").value = item.name;
    $("category").value = item.category;
    $("quantity").value = item.quantity;
}

function deleteItem(id) {
    const item = items.find(item => item.id === id);
    if (!item) return;

    if (item.available !== item.quantity) {
        alert("You cannot delete an item while some quantity is borrowed.");
        return;
    }

    if (!confirm("Delete this inventory item?")) return;

    items = items.filter(item => item.id !== id);

    saveData();
    renderAll();
}

function renderInventory() {
    const search = $("item-search").value.toLowerCase();

    $("inventory-table").innerHTML = items
        .filter(item =>
            item.name.toLowerCase().includes(search) ||
            item.category.toLowerCase().includes(search) ||
            item.id.toLowerCase().includes(search)
        )
        .map(item => `
            <tr>
                <td>${escapeHTML(item.id)}</td>
                <td>${escapeHTML(item.name)}</td>
                <td>${escapeHTML(item.category)}</td>
                <td>${item.quantity}</td>
                <td>${item.available}</td>
                <td>
                    <button class="action-btn"
                        data-action="edit-item"
                        data-id="${escapeHTML(item.id)}">Edit</button>

                    <button class="action-btn delete-btn"
                        data-action="delete-item"
                        data-id="${escapeHTML(item.id)}">Delete</button>
                </td>
            </tr>
        `).join("") || `<tr><td colspan="6">No items found.</td></tr>`;
}

// BORROWERS

function addBorrower() {
    openModal("Register Borrower", [
        { id: "name", label: "Full Name" },
        {
            id: "type",
            label: "Borrower Type",
            options: [
                { value: "Student", label: "Student" },
                { value: "Teacher", label: "Teacher" }
            ]
        },
        { id: "contact", label: "Contact Information" }
    ], values => {
        borrowers.push({
            id: makeId("BR-"),
            name: values.name,
            type: values.type,
            contact: values.contact
        });

        saveData();
        renderAll();
    });
}

function deleteBorrower(id) {
    const hasBorrowed = transactions.some(transaction =>
        transaction.borrowerId === id &&
        transaction.status === "Borrowed"
    );

    if (hasBorrowed) {
        alert("This borrower has an unreturned item.");
        return;
    }

    if (!confirm("Delete this borrower?")) return;

    borrowers = borrowers.filter(borrower => borrower.id !== id);

    saveData();
    renderAll();
}

function renderBorrowers() {
    const search = $("borrower-search").value.toLowerCase();

    $("borrowers-table").innerHTML = borrowers
        .filter(borrower =>
            borrower.name.toLowerCase().includes(search) ||
            borrower.type.toLowerCase().includes(search)
        )
        .map(borrower => `
            <tr>
                <td>${escapeHTML(borrower.id)}</td>
                <td>${escapeHTML(borrower.name)}</td>
                <td>${escapeHTML(borrower.type)}</td>
                <td>${escapeHTML(borrower.contact)}</td>
                <td>
                    <button class="action-btn delete-btn"
                        data-action="delete-borrower"
                        data-id="${escapeHTML(borrower.id)}">Delete</button>
                </td>
            </tr>
        `).join("") || `<tr><td colspan="5">No borrowers found.</td></tr>`;
}

// BORROWING

function recordBorrowing() {
    const availableItems = items.filter(item => item.available > 0);

    if (!borrowers.length || !availableItems.length) {
        alert("Add at least one borrower and one available inventory item first.");
        return;
    }

    openModal("Record Borrowing", [
        {
            id: "borrower",
            label: "Select Borrower",
            options: borrowers.map(borrower => ({
                value: borrower.id,
                label: `${borrower.name} (${borrower.type})`
            }))
        },
        {
            id: "item",
            label: "Select Item",
            options: availableItems.map(item => ({
                value: item.id,
                label: `${item.name} (${item.available} available)`
            }))
        },
        {
            id: "quantity",
            label: "Quantity",
            type: "number",
            min: 1
        },
        {
            id: "returnDate",
            label: "Expected Return Date",
            type: "date"
        }
    ], values => {
        const item = items.find(item => item.id === values.item);
        const quantity = Number(values.quantity);

        if (
            !item ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > item.available
        ) {
            alert("Invalid quantity or insufficient stock.");
            return;
        }

        if (!values.returnDate) {
            alert("Please choose an expected return date.");
            return;
        }

        item.available -= quantity;

        transactions.push({
            id: makeId("TR-"),
            borrowerId: values.borrower,
            itemId: item.id,
            quantity,
            borrowDate: new Date().toISOString().slice(0, 10),
            returnDate: values.returnDate,
            actualReturnDate: "",
            status: "Borrowed"
        });

        saveData();
        renderAll();
    });

    $("quantity").value = 1;
}

// RETURNING

function returnItem(id) {
    const transaction = transactions.find(
        transaction => transaction.id === id
    );

    if (!transaction || transaction.status !== "Borrowed") return;

    const item = items.find(item => item.id === transaction.itemId);

    if (!item) {
        alert("Inventory record not found. Please check the inventory.");
        return;
    }

    if (!confirm("Confirm that this item has been returned?")) return;

    item.available += transaction.quantity;

    transaction.status = "Returned";
    transaction.actualReturnDate =
        new Date().toISOString().slice(0, 10);

    saveData();
    renderAll();
}

// TRANSACTIONS

function renderTransactions() {
    $("transactions-table").innerHTML = transactions
        .slice()
        .reverse()
        .map(transaction => {
            const borrower = borrowers.find(
                borrower => borrower.id === transaction.borrowerId
            );

            const item = items.find(
                item => item.id === transaction.itemId
            );

            return `
                <tr>
                    <td>${escapeHTML(transaction.id)}</td>
                    <td>${escapeHTML(borrower?.name || "Unknown")}</td>
                    <td>${escapeHTML(item?.name || "Unknown")}</td>
                    <td>${transaction.quantity}</td>
                    <td>${escapeHTML(transaction.borrowDate)}</td>
                    <td>${escapeHTML(
                        transaction.actualReturnDate || transaction.returnDate
                    )}</td>
                    <td>
                        <span class="status ${transaction.status.toLowerCase()}">
                            ${escapeHTML(transaction.status)}
                        </span>
                    </td>
                    <td>
                        ${transaction.status === "Borrowed"
                            ? `<button class="action-btn"
                                data-action="return-item"
                                data-id="${escapeHTML(transaction.id)}">
                                Return
                               </button>`
                            : "Completed"}
                    </td>
                </tr>
            `;
        }).join("") ||
        `<tr><td colspan="8">No transactions recorded.</td></tr>`;
}

// DASHBOARD

function renderDashboard() {
    $("total-items").textContent = items.reduce(
        (sum, item) => sum + item.quantity, 0
    );

    $("available-items").textContent = items.reduce(
        (sum, item) => sum + item.available, 0
    );

    $("borrowed-items").textContent = items.reduce(
        (sum, item) => sum + item.quantity - item.available, 0
    );

    $("total-borrowers").textContent = borrowers.length;

    $("dashboard-transactions").innerHTML = transactions
        .slice()
        .reverse()
        .slice(0, 5)
        .map(transaction => {
            const borrower = borrowers.find(
                borrower => borrower.id === transaction.borrowerId
            );

            const item = items.find(
                item => item.id === transaction.itemId
            );

            return `
                <tr>
                    <td>${escapeHTML(borrower?.name || "Unknown")}</td>
                    <td>${escapeHTML(item?.name || "Unknown")}</td>
                    <td>${escapeHTML(transaction.borrowDate)}</td>
                    <td>
                        <span class="status ${transaction.status.toLowerCase()}">
                            ${escapeHTML(transaction.status)}
                        </span>
                    </td>
                </tr>
            `;
        }).join("") ||
        `<tr><td colspan="4">No recent transactions.</td></tr>`;
}

// CSV EXPORT

function exportTransactions() {
    if (!transactions.length) {
        alert("There are no transactions to export.");
        return;
    }

    const headers = [
        "Transaction ID",
        "Borrower",
        "Item",
        "Quantity",
        "Borrow Date",
        "Expected Return",
        "Actual Return",
        "Status"
    ];

    const rows = transactions.map(transaction => {
        const borrower = borrowers.find(
            borrower => borrower.id === transaction.borrowerId
        );

        const item = items.find(
            item => item.id === transaction.itemId
        );

        return [
            transaction.id,
            borrower?.name || "Unknown",
            item?.name || "Unknown",
            transaction.quantity,
            transaction.borrowDate,
            transaction.returnDate,
            transaction.actualReturnDate,
            transaction.status
        ];
    });

    const csv = [headers, ...rows]
        .map(row => row.map(value =>
            `"${String(value).replace(/"/g, '""')}"`
        ).join(","))
        .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "SchoolBorrow_Transactions.csv";
    link.click();

    URL.revokeObjectURL(url);
}

// BUTTON EVENTS

$("add-item-btn").addEventListener("click", addItem);
$("add-borrower-btn").addEventListener("click", addBorrower);
$("borrow-btn").addEventListener("click", recordBorrowing);
$("export-btn").addEventListener("click", exportTransactions);

$("item-search").addEventListener("input", renderInventory);
$("borrower-search").addEventListener("input", renderBorrowers);

document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "edit-item") editItem(id);
    if (action === "delete-item") deleteItem(id);
    if (action === "delete-borrower") deleteBorrower(id);
    if (action === "return-item") returnItem(id);
});

// INITIALIZE

renderAll();

if (sessionStorage.getItem("schoolborrow_logged_in") === "true") {
    showDashboard();
} else {
    showLogin();
}
