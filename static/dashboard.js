let me = null;
let tasks = [];
let currentCalendarDate = new Date();

/* ==========================================
   API & UTILS
========================================== */

async function api(url, options = {}) {
    const r = await fetch(url, options);
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Request failed");
    return d;
}

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ==========================================
   INITIALIZATION
========================================== */

async function init() {
    try {
        me = await api("/api/me");
    } catch {
        location.href = "/";
        return;
    }

    const userName = document.getElementById("userName");
    const roleBadge = document.getElementById("roleBadge");
    const waCard = document.getElementById("waCard");
    const canvaCard = document.getElementById("canvaCard");
    const folderCard = document.getElementById("folderCard");

    if (userName) userName.textContent = me.name;
    if (roleBadge) roleBadge.textContent = me.role === "head" ? "HEAD" : (me.team_member_id || "MEMBER");

    const res = await api("/api/resources");
    if (waCard) waCard.href = res.whatsapp || "#";
    if (canvaCard) canvaCard.href = res.canva || "#";
    if (folderCard) folderCard.href = res.folder || "#";

    if (me.role === "head") {
        document.getElementById("headPanel")?.classList.remove("hidden");
        document.getElementById("headManagement")?.classList.remove("hidden");
        document.getElementById("auditPanel")?.classList.remove("hidden");
        await loadMembers();
        await loadAudit();
    }

    await loadTasks();
}

/* ==========================================
   DATE HELPERS
========================================== */

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(date);
}

function formatDateOnly(value) {
    if (!value) return "No due date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No due date";

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function relativeTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 30) return "Just now";
    if (minutes < 1) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return formatDateTime(value);
}

/* ==========================================
   CALENDAR
========================================== */

function getStatusClass(status) {
    if (!status) return "assigned";
    switch (status.toLowerCase()) {
        case "completed":
            return "completed";
        case "in progress":
            return "progress";
        default:
            return "assigned";
    }
}

function renderCalendar() {
    const grid = document.getElementById("calendarGrid");
    const monthLabel = document.getElementById("calendarMonth");

    if (!grid || !monthLabel) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    monthLabel.textContent = new Intl.DateTimeFormat("en-IN", {
        month: "long",
        year: "numeric"
    }).format(currentCalendarDate);

    grid.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();

    /* Previous month padding */
    for (let i = firstDay; i > 0; i--) {
        const day = document.createElement("div");
        day.className = "calendar-day other-month";
        day.innerHTML = `<span class="day-number">${previousMonthDays - i + 1}</span>`;
        grid.appendChild(day);
    }

    /* Current month days */
    const today = new Date();
    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
        const cell = document.createElement("div");
        cell.className = "calendar-day";

        const cellDate = new Date(year, month, dayNumber);

        if (
            cellDate.getDate() === today.getDate() &&
            cellDate.getMonth() === today.getMonth() &&
            cellDate.getFullYear() === today.getFullYear()
        ) {
            cell.classList.add("today");
        }

        cell.innerHTML = `<span class="day-number">${dayNumber}</span>`;

        const dayTasks = tasks.filter(task => {
            if (!task.due_date) return false;
            const due = new Date(task.due_date);
            return (
                due.getFullYear() === year &&
                due.getMonth() === month &&
                due.getDate() === dayNumber
            );
        });

        const maxTasks = 2;
        dayTasks.slice(0, maxTasks).forEach(task => {
            const taskElement = document.createElement("span");
            taskElement.className = `calendar-task ${getStatusClass(task.status)}`;
            taskElement.textContent = task.title;
            taskElement.title = `${task.title} — ${task.status}`;

            taskElement.addEventListener("click", event => {
                event.stopPropagation();
                openTaskModal(task);
            });

            cell.appendChild(taskElement);
        });

        if (dayTasks.length > maxTasks) {
            const more = document.createElement("span");
            more.className = "calendar-more";
            more.textContent = `+${dayTasks.length - maxTasks} more`;
            cell.appendChild(more);
        }

        grid.appendChild(cell);
    }

    /* Fill remaining grid cells to balance rows */
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;

    for (let i = 1; i <= remaining; i++) {
        const cell = document.createElement("div");
        cell.className = "calendar-day other-month";
        cell.innerHTML = `<span class="day-number">${i}</span>`;
        grid.appendChild(cell);
    }
}

/* Calendar Controls */
document.getElementById("prevMonth")?.addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById("nextMonth")?.addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
});

document.getElementById("todayBtn")?.addEventListener("click", () => {
    currentCalendarDate = new Date();
    renderCalendar();
});

/* ==========================================
   TASK MODAL
========================================== */

function openTaskModal(task) {
    document.getElementById("modalTaskTitle").textContent = task.title || "Untitled task";
    document.getElementById("modalTaskDescription").textContent = task.description || "No description available.";
    document.getElementById("modalTaskStatus").textContent = task.status || "Assigned";
    document.getElementById("modalTaskAssignee").textContent = task.assigned_name || "—";
    document.getElementById("modalTaskDueDate").textContent = formatDateOnly(task.due_date);

    document.getElementById("taskModal")?.classList.remove("hidden");
}

document.getElementById("closeTaskModal")?.addEventListener("click", () => {
    document.getElementById("taskModal")?.classList.add("hidden");
});

document.getElementById("taskModal")?.addEventListener("click", event => {
    if (event.target.id === "taskModal") {
        event.currentTarget.classList.add("hidden");
    }
});

/* ==========================================
   TASKS API & RENDERING
========================================== */

async function loadTasks() {
    try {
        tasks = await api("/api/tasks");
        renderTasks();
    } catch (err) {
        console.error("Failed to load tasks:", err);
    }
}

function renderTasks() {
    const list = document.getElementById("taskList");
    const count = document.getElementById("taskCount");
    const summary = document.getElementById("taskSummary");

    if (count) count.textContent = tasks.length;
    if (summary) summary.textContent = `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;

    if (!list) return;

    if (!tasks.length) {
        list.innerHTML = `<div class="audit-empty">No tasks assigned yet.</div>`;
        renderCalendar();
        return;
    }

    list.innerHTML = "";

    tasks.forEach(task => {
        const card = document.createElement("div");
        card.className = "task-card";
        const status = task.status || "Assigned";

        card.innerHTML = `
            <div class="task-card-head">
                <h3>${escapeHtml(task.title || "Untitled task")}</h3>
                <span class="badge">${escapeHtml(status)}</span>
            </div>
            <p>${escapeHtml(task.description || "No description available.")}</p>
            <div class="task-meta">
                <span class="task-due">Due: ${formatDateOnly(task.due_date)}</span>
                <select class="status-select">
                    <option value="Assigned" ${status === "Assigned" ? "selected" : ""}>Assigned</option>
                    <option value="In Progress" ${status === "In Progress" ? "selected" : ""}>In Progress</option>
                    <option value="Completed" ${status === "Completed" ? "selected" : ""}>Completed</option>
                </select>
            </div>
        `;

        const select = card.querySelector(".status-select");
        select.addEventListener("change", async (e) => {
            e.stopPropagation();
            try {
                await api(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: select.value })
                });
                task.status = select.value;
                renderTasks();
            } catch (error) {
                alert(error.message);
            }
        });

        card.addEventListener("click", event => {
            if (event.target.tagName === "SELECT" || event.target.tagName === "OPTION") return;
            openTaskModal(task);
        });

        list.appendChild(card);
    });

    renderCalendar();
}

/* ==========================================
   MEMBERS MANAGEMENT
========================================== */

async function loadMembers() {
    const data = await api("/api/members");
    const assignee = document.getElementById("assignee");
    const memberList = document.getElementById("memberList");

    if (assignee) {
        assignee.innerHTML = data
            .filter(x => x.active)
            .map(x => `<option value="${x.id}">${escapeHtml(x.team_member_id)} — ${escapeHtml(x.name)}</option>`)
            .join("");
    }

    if (memberList) {
        memberList.innerHTML = data
            .map(x => `
                <div class="member-row">
                    <div>
                        <strong>${escapeHtml(x.name)}</strong>
                        <span>${escapeHtml(x.team_member_id)} · ${escapeHtml(x.email)} · ${escapeHtml(x.phone)}</span>
                    </div>
                    <button class="ghost-btn" onclick="toggleMember('${x.id}', ${!x.active})">${x.active ? "Disable" : "Enable"}</button>
                </div>
            `).join("");
    }
}

async function toggleMember(id, active) {
    await api(`/api/members/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
    });
    await loadMembers();
}

/* ==========================================
   AUDIT LOGS
========================================== */

async function loadAudit() {
    const data = await api("/api/audit");
    renderAudit(data);
}

function formatAuditAction(action) {
    const actionMap = {
        "login_success": "Successful login",
        "login_failed": "Failed login attempt",
        "logout": "Signed out",
        "task_created": "Task assigned",
        "task_updated": "Task updated",
        "member_created": "Team member added",
        "member_disabled": "Team member disabled"
    };
    return actionMap[action] || action;
}

function renderAudit(logs) {
    const container = document.getElementById("auditList");
    const count = document.getElementById("auditCount");

    if (!container) return;
    if (count) count.textContent = `${logs.length} event${logs.length === 1 ? "" : "s"}`;

    if (!logs.length) {
        container.innerHTML = `<div class="audit-empty">No security events recorded.</div>`;
        return;
    }

    container.innerHTML = "";

    logs.forEach(log => {
        const item = document.createElement("div");
        item.className = "audit-item";

        const action = log.action || "Activity";
        const user = log.metadata?.name || log.metadata?.email || log.user_id || "System";
        const timestamp = log.created_at;

        item.innerHTML = `
            <div class="audit-dot"></div>
            <div class="audit-content">
                <div class="audit-action">${escapeHtml(formatAuditAction(action))}</div>
                <div class="audit-user">${escapeHtml(user)}</div>
                ${log.ip ? `<div class="audit-ip">IP: ${escapeHtml(log.ip)}</div>` : ""}
            </div>
            <div class="audit-time" title="${escapeHtml(formatDateTime(timestamp))}">
                ${escapeHtml(relativeTime(timestamp))}<br>
                ${escapeHtml(formatDateTime(timestamp))}
            </div>
        `;

        container.appendChild(item);
    });
}

/* ==========================================
   FORM LISTENERS & EVENT HANDLERS
========================================== */

document.getElementById("taskForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    try {
        await api("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: document.getElementById("taskTitle").value,
                description: document.getElementById("taskDescription").value,
                assigned_to: document.getElementById("assignee").value,
                due_date: document.getElementById("dueDate").value
            })
        });
        e.target.reset();
        await loadTasks();
        alert("Task assigned.");
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("memberFormAdmin")?.addEventListener("submit", async e => {
    e.preventDefault();
    try {
        await api("/api/members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: document.getElementById("newName").value,
                email: document.getElementById("newEmail").value,
                phone: document.getElementById("newPhone").value,
                team_member_id: document.getElementById("newMemberId").value
            })
        });
        e.target.reset();
        await loadMembers();
    } catch (err) {
        alert(err.message);
    }
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    location.href = "/";
});

/* Kick off application */
init();
