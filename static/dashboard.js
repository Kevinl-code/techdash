// State variables
let me = null;

// Helper function to handle API requests
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

// Utility function to sanitize HTML string to prevent XSS attacks
function escapeHtml(s = "") {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[c])
  );
}

// Initialize dashboard data and user authentication status
async function init() {
  try {
    me = await api("/api/me");
  } catch {
    location.href = "/";
    return;
  }

  // Update UI user details
  userName.textContent = me.name;
  roleBadge.textContent =
    me.role === "head" ? "HEAD" : me.team_member_id || "MEMBER";

  // Load external resources/links
  const res = await api("/api/resources");
  waCard.href = res.whatsapp || "#";
  canvaCard.href = res.canva || "#";
  folderCard.href = res.folder || "#";

  // Show admin panels if the logged-in user is a "head"
  if (me.role === "head") {
    headPanel.classList.remove("hidden");
    headManagement.classList.remove("hidden");
    auditPanel.classList.remove("hidden");
    await loadMembers();
    await loadAudit();
  }

  await loadTasks();
}

// Load and display tasks
async function loadTasks() {
  const data = await api("/api/tasks");
  taskCount.textContent = data.length;

  taskList.innerHTML = data.length
    ? data
        .map(
          (t) => `<article class="task">
            <div>
              <h3>${escapeHtml(t.title)}</h3>
              <p>${escapeHtml(t.description || "")}</p>
              <small>${escapeHtml(t.assigned_name || "")} ${
            t.due_date ? "· Due " + escapeHtml(t.due_date) : ""
          }</small>
            </div>
            <select data-task="${t.id}" class="status-select">
              ${["Assigned", "In Progress", "Completed"]
                .map(
                  (s) =>
                    `<option ${t.status === s ? "selected" : ""}>${s}</option>`
                )
                .join("")}
            </select>
          </article>`
        )
        .join("")
    : `<div class="empty">No tasks available.</div>`;

  // Attach change event listeners to update task status dynamically
  document.querySelectorAll(".status-select").forEach((select) =>
    select.addEventListener("change", async () => {
      await api("/api/tasks/" + select.dataset.task, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: select.value }),
      });
    })
  );
}

// Load members list (for Head role)
async function loadMembers() {
  const data = await api("/api/members");

  // Populate task assignment dropdown with active members
  assignee.innerHTML = data
    .filter((x) => x.active)
    .map(
      (x) =>
        `<option value="${x.id}">${escapeHtml(x.team_member_id)} — ${escapeHtml(
          x.name
        )}</option>`
    )
    .join("");

  // Populate member list UI with enable/disable buttons
  memberList.innerHTML = data
    .map(
      (x) => `<div class="member-row">
        <div>
          <strong>${escapeHtml(x.name)}</strong>
          <span>${escapeHtml(x.team_member_id)} · ${escapeHtml(
        x.email
      )} · ${escapeHtml(x.phone)}</span>
        </div>
        <button class="ghost-btn" onclick="toggleMember('${x.id}', ${!x.active})">
          ${x.active ? "Disable" : "Enable"}
        </button>
      </div>`
    )
    .join("");
}

// Toggle active status of a member
async function toggleMember(id, active) {
  await api("/api/members/" + id + "/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  await loadMembers();
}

// Load system audit log (for Head role)
async function loadAudit() {
  const data = await api("/api/audit");
  auditList.innerHTML = data
    .map(
      (x) => `<div class="audit-row">
        <strong>${escapeHtml(x.action)}</strong>
        <span>${escapeHtml(x.created_at || "")} · ${escapeHtml(
        x.ip || ""
      )}</span>
      </div>`
    )
    .join("");
}

// Event Listener: Create Task Form
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: taskTitle.value,
        description: taskDescription.value,
        assigned_to: assignee.value,
        due_date: dueDate.value,
      }),
    });
    e.target.reset();
    await loadTasks();
    alert("Task assigned.");
  } catch (err) {
    alert(err.message);
  }
});

// Event Listener: Add New Member Form (Admin)
memberFormAdmin.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.value,
        email: newEmail.value,
        phone: newPhone.value,
        team_member_id: newMemberId.value,
      }),
    });
    e.target.reset();
    await loadMembers();
  } catch (err) {
    alert(err.message);
  }
});

// Event Listener: Logout Button
logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  location.href = "/";
});

// Start initialization on load
init();
