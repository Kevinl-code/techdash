let me = null;
let tasks = [];
let availableMembers = [];

let currentCalendarDate = new Date();

let assignmentMode = "members";

let pickerDate = new Date();
let selectedDateValue = null;


// =========================================================
// API
// =========================================================

async function api(url, options = {}) {

    const response = await fetch(url, {
        credentials: "same-origin",
        ...options
    });

    const data = await response
        .json()
        .catch(() => ({}));

    if (!response.ok) {

        throw new Error(
            data.error ||
            "Request failed"
        );
    }

    return data;
}


// =========================================================
// HTML ESCAPE
// =========================================================

function escapeHtml(value = "") {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// =========================================================
// DATE HELPERS
// =========================================================

function formatDateTime(value) {

    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }
    ).format(date);
}


function formatDateOnly(value) {

    if (!value) {
        return "No due date";
    }

    /*
     * For YYYY-MM-DD, avoid timezone
     * shifting by parsing manually.
     */

    if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {

        const [
            year,
            month,
            day
        ] = value.split("-").map(Number);

        const date = new Date(
            year,
            month - 1,
            day
        );

        return new Intl.DateTimeFormat(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        ).format(date);
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "No due date";
    }

    return new Intl.DateTimeFormat(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    ).format(date);
}


function relativeTime(value) {

    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const diff =
        Date.now() -
        date.getTime();

    const seconds =
        Math.floor(diff / 1000);

    const minutes =
        Math.floor(seconds / 60);

    const hours =
        Math.floor(minutes / 60);

    const days =
        Math.floor(hours / 24);

    if (seconds < 30) {
        return "Just now";
    }

    if (minutes < 1) {
        return `${seconds}s ago`;
    }

    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    if (hours < 24) {
        return `${hours}h ago`;
    }

    if (days < 7) {
        return `${days}d ago`;
    }

    return formatDateTime(value);
}


// =========================================================
// STATUS
// =========================================================

function getStatusClass(status) {

    switch (
        String(status || "")
            .toLowerCase()
    ) {

        case "completed":
            return "completed";

        case "in progress":
            return "progress";

        default:
            return "assigned";
    }
}


// =========================================================
// INITIALIZATION
// =========================================================

async function init() {

    try {

        me = await api("/api/me");

    } catch (error) {

        console.error(
            "Authentication check failed:",
            error
        );

        location.href = "/";

        return;
    }

    const userName =
        document.getElementById(
            "userName"
        );

    const roleBadge =
        document.getElementById(
            "roleBadge"
        );

    if (userName) {
        userName.textContent =
            me.name || "";
    }

    if (roleBadge) {

        roleBadge.textContent =
            me.role === "head"
                ? "HEAD"
                : (
                    me.team_member_id
                    || "MEMBER"
                );
    }


    // =====================================================
    // RESOURCES
    // =====================================================

    try {

        const resources =
            await api(
                "/api/resources"
            );

        const waCard =
            document.getElementById(
                "waCard"
            );

        const canvaCard =
            document.getElementById(
                "canvaCard"
            );

        const folderCard =
            document.getElementById(
                "folderCard"
            );

        if (waCard) {
            waCard.href =
                resources.whatsapp || "#";
        }

        if (canvaCard) {
            canvaCard.href =
                resources.canva || "#";
        }

        if (folderCard) {
            folderCard.href =
                resources.folder || "#";
        }

    } catch (error) {

        console.error(
            "Failed to load resources:",
            error
        );
    }


    // =====================================================
    // HEAD ONLY
    // =====================================================

    if (me.role === "head") {

        document
            .getElementById("headPanel")
            ?.classList.remove("hidden");

        document
            .getElementById("headManagement")
            ?.classList.remove("hidden");

        document
            .getElementById("auditPanel")
            ?.classList.remove("hidden");

        await loadMembers();

        await loadTaskMembers();

        await loadAudit();
    }


    // =====================================================
    // TASKS
    // =====================================================

    await loadTasks();

    renderDatePicker();
}


// =========================================================
// CALENDAR
// =========================================================

function renderCalendar() {

    const grid =
        document.getElementById(
            "calendarGrid"
        );

    const monthLabel =
        document.getElementById(
            "calendarMonth"
        );

    if (!grid || !monthLabel) {
        return;
    }

    const year =
        currentCalendarDate.getFullYear();

    const month =
        currentCalendarDate.getMonth();

    monthLabel.textContent =
        new Intl.DateTimeFormat(
            "en-IN",
            {
                month: "long",
                year: "numeric"
            }
        ).format(
            currentCalendarDate
        );

    grid.innerHTML = "";

    const firstDay =
        new Date(
            year,
            month,
            1
        ).getDay();

    const daysInMonth =
        new Date(
            year,
            month + 1,
            0
        ).getDate();

    const previousMonthDays =
        new Date(
            year,
            month,
            0
        ).getDate();


    // -----------------------------------------------------
    // PREVIOUS MONTH
    // -----------------------------------------------------

    for (
        let i = firstDay;
        i > 0;
        i--
    ) {

        const day =
            document.createElement(
                "div"
            );

        day.className =
            "calendar-day other-month";

        day.innerHTML = `
            <span class="day-number">
                ${previousMonthDays - i + 1}
            </span>
        `;

        grid.appendChild(day);
    }


    // -----------------------------------------------------
    // CURRENT MONTH
    // -----------------------------------------------------

    const today = new Date();

    for (
        let dayNumber = 1;
        dayNumber <= daysInMonth;
        dayNumber++
    ) {

        const cell =
            document.createElement(
                "div"
            );

        cell.className =
            "calendar-day";

        const cellDate =
            new Date(
                year,
                month,
                dayNumber
            );


        if (
            cellDate.getDate() ===
                today.getDate() &&
            cellDate.getMonth() ===
                today.getMonth() &&
            cellDate.getFullYear() ===
                today.getFullYear()
        ) {

            cell.classList.add(
                "today"
            );
        }


        cell.innerHTML = `
            <span class="day-number">
                ${dayNumber}
            </span>
        `;


        // -------------------------------------------------
        // TASKS ON DATE
        // -------------------------------------------------

        const dayTasks =
            tasks.filter(task => {

                if (!task.due_date) {
                    return false;
                }

                let due;

                if (
                    typeof task.due_date ===
                        "string" &&
                    /^\d{4}-\d{2}-\d{2}$/
                        .test(task.due_date)
                ) {

                    const [
                        y,
                        m,
                        d
                    ] =
                        task.due_date
                            .split("-")
                            .map(Number);

                    due = new Date(
                        y,
                        m - 1,
                        d
                    );

                } else {

                    due = new Date(
                        task.due_date
                    );
                }

                return (
                    due.getFullYear() === year &&
                    due.getMonth() === month &&
                    due.getDate() === dayNumber
                );
            });


        const maxTasks = 2;


        dayTasks
            .slice(0, maxTasks)
            .forEach(task => {

                const taskElement =
                    document.createElement(
                        "span"
                    );

                taskElement.className =
                    `calendar-task ${
                        getStatusClass(
                            task.status
                        )
                    }`;

                taskElement.textContent =
                    task.title;

                taskElement.title =
                    `${task.title} — ${task.status}`;

                taskElement.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();

                        openTaskModal(task);
                    }
                );

                cell.appendChild(
                    taskElement
                );
            });


        if (
            dayTasks.length >
            maxTasks
        ) {

            const more =
                document.createElement(
                    "span"
                );

            more.className =
                "calendar-more";

            more.textContent =
                `+${dayTasks.length - maxTasks} more`;

            cell.appendChild(more);
        }

        grid.appendChild(cell);
    }


    // -----------------------------------------------------
    // NEXT MONTH PADDING
    // -----------------------------------------------------

    const totalCells =
        firstDay +
        daysInMonth;

    const remaining =
        (
            7 -
            (totalCells % 7)
        ) % 7;

    for (
        let i = 1;
        i <= remaining;
        i++
    ) {

        const cell =
            document.createElement(
                "div"
            );

        cell.className =
            "calendar-day other-month";

        cell.innerHTML = `
            <span class="day-number">
                ${i}
            </span>
        `;

        grid.appendChild(cell);
    }
}


// =========================================================
// CALENDAR CONTROLS
// =========================================================

document
    .getElementById("prevMonth")
    ?.addEventListener(
        "click",
        () => {

            currentCalendarDate
                .setMonth(
                    currentCalendarDate
                        .getMonth() - 1
                );

            renderCalendar();
        }
    );


document
    .getElementById("nextMonth")
    ?.addEventListener(
        "click",
        () => {

            currentCalendarDate
                .setMonth(
                    currentCalendarDate
                        .getMonth() + 1
                );

            renderCalendar();
        }
    );


document
    .getElementById("todayBtn")
    ?.addEventListener(
        "click",
        () => {

            currentCalendarDate =
                new Date();

            renderCalendar();
        }
    );


// =========================================================
// TASK ASSIGNEE DISPLAY
// =========================================================

function getTaskMembers(task) {

    if (
        Array.isArray(
            task.assigned_members
        )
    ) {

        return task.assigned_members;
    }

    if (
        Array.isArray(
            task.assignments
        )
    ) {

        return task.assignments;
    }

    return [];
}


function renderAssigneeNames(task) {

    const members =
        getTaskMembers(task);

    if (!members.length) {
        return "No members";
    }

    const names =
        members.map(
            member =>
                member.member_name ||
                member.name ||
                "Member"
        );

    if (names.length <= 2) {
        return names.join(", ");
    }

    return `${names[0]}, ${names[1]} +${
        names.length - 2
    } more`;
}


// =========================================================
// TASK MODAL
// =========================================================

function openTaskModal(task) {

    const titleEl =
        document.getElementById(
            "modalTaskTitle"
        );

    const descEl =
        document.getElementById(
            "modalTaskDescription"
        );

    const statusEl =
        document.getElementById(
            "modalTaskStatus"
        );

    const assigneeEl =
        document.getElementById(
            "modalTaskAssignee"
        );

    const dueEl =
        document.getElementById(
            "modalTaskDueDate"
        );


    if (titleEl) {

        titleEl.textContent =
            task.title ||
            "Untitled task";
    }


    if (descEl) {

        descEl.textContent =
            task.description ||
            "No description available.";
    }


    if (statusEl) {

        statusEl.textContent =
            task.status ||
            "Assigned";
    }


    if (assigneeEl) {

        const members =
            getTaskMembers(task);

        if (!members.length) {

            assigneeEl.textContent =
                "—";

        } else {

            assigneeEl.innerHTML =
                members
                    .map(member => `
                        <div>
                            <strong>
                                ${escapeHtml(
                                    member.member_name ||
                                    member.name ||
                                    "Member"
                                )}
                            </strong>

                            ${
                                member.member_email
                                    ? `
                                    <small>
                                        ${escapeHtml(
                                            member.member_email
                                        )}
                                    </small>
                                    `
                                    : ""
                            }
                        </div>
                    `)
                    .join("");
        }
    }


    if (dueEl) {

        dueEl.textContent =
            formatDateOnly(
                task.due_date
            );
    }


    document
        .getElementById(
            "taskModal"
        )
        ?.classList.remove(
            "hidden"
        );
}


// =========================================================
// CLOSE MODAL
// =========================================================

document
    .getElementById("closeTaskModal")
    ?.addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "taskModal"
                )
                ?.classList.add(
                    "hidden"
                );
        }
    );

const resourcesEl =
    document.getElementById(
        "modalTaskResources"
    );

if (resourcesEl) {

    const resourceButtons = [];

    if (task.canva_url) {

        resourceButtons.push(`
            <a
                href="${escapeHtml(task.canva_url)}"
                target="_blank"
                rel="noopener noreferrer"
                class="task-resource-btn"
            >
                🎨 Open Canva Design ↗
            </a>
        `);
    }

    if (task.assets_folder_url) {

        resourceButtons.push(`
            <a
                href="${escapeHtml(task.assets_folder_url)}"
                target="_blank"
                rel="noopener noreferrer"
                class="task-resource-btn"
            >
                📁 Open Asset Folder ↗
            </a>
        `);
    }

    if (task.reference_url) {

        resourceButtons.push(`
            <a
                href="${escapeHtml(task.reference_url)}"
                target="_blank"
                rel="noopener noreferrer"
                class="task-resource-btn"
            >
                🔗 Open Reference ↗
            </a>
        `);
    }

    resourcesEl.innerHTML =
        resourceButtons.length
            ? `
                <p class="eyebrow">
                    TASK RESOURCES
                </p>

                <div class="modal-resource-list">
                    ${resourceButtons.join("")}
                </div>
              `
            : "";
}
document
    .getElementById("taskModal")
    ?.addEventListener(
        "click",
        event => {

            if (
                event.target.id ===
                "taskModal"
            ) {

                event.currentTarget
                    .classList.add(
                        "hidden"
                    );
            }
        }
    );


// =========================================================
// LOAD TASKS
// =========================================================

async function loadTasks() {

    try {

        tasks =
            await api(
                "/api/tasks"
            );

        renderTasks();

    } catch (error) {

        console.error(
            "Failed to load tasks:",
            error
        );
    }
}


// =========================================================
// RENDER TASKS
// =========================================================

function renderTasks() {

    const list =
        document.getElementById(
            "taskList"
        );

    const count =
        document.getElementById(
            "taskCount"
        );

    const summary =
        document.getElementById(
            "taskSummary"
        );


    if (count) {

        count.textContent =
            tasks.length;
    }


    if (summary) {

        summary.textContent =
            `${tasks.length} task${
                tasks.length === 1
                    ? ""
                    : "s"
            }`;
    }


    if (!list) {
        return;
    }


    if (!tasks.length) {

        list.innerHTML = `
            <div class="audit-empty">
                No tasks assigned yet.
            </div>
        `;

        renderCalendar();

        return;
    }


    list.innerHTML = "";


    tasks.forEach(task => {

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "task-card";


        const status =
            task.status ||
            "Assigned";


        const members =
            getTaskMembers(task);


        const memberNames =
            renderAssigneeNames(task);


        const memberCount =
            members.length;


        card.innerHTML = `

            <div class="task-card-head">

                <h3>
                    ${escapeHtml(
                        task.title ||
                        "Untitled task"
                    )}
                </h3>

                <span class="badge">
                    ${escapeHtml(
                        status
                    )}
                </span>

            </div>


            <p>
                ${escapeHtml(
                    task.description ||
                    "No description available."
                )}
            </p>


            <div class="task-assignees">

                <span class="task-assignee-label">
                    Assigned to
                </span>

                <span class="task-assignee-names">
                    ${escapeHtml(
                        memberNames
                    )}
                </span>

                ${
                    memberCount
                        ? `
                            <span class="task-member-count">
                                ${memberCount}
                                ${
                                    memberCount === 1
                                        ? "member"
                                        : "members"
                                }
                            </span>
                          `
                        : ""
                }

            </div>
            <div class="task-resources">

    ${
        task.canva_url
            ? `
                <a
                    class="task-resource-btn canva-resource"
                    href="${escapeHtml(task.canva_url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick="event.stopPropagation()"
                >
                    🎨
                    <span>Open Canva</span>
                    ↗
                </a>
            `
            : ""
    }


    ${
        task.assets_folder_url
            ? `
                <a
                    class="task-resource-btn folder-resource"
                    href="${escapeHtml(task.assets_folder_url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick="event.stopPropagation()"
                >
                    📁
                    <span>Open Assets</span>
                    ↗
                </a>
            `
            : ""
    }


    ${
        task.reference_url
            ? `
                <a
                    class="task-resource-btn reference-resource"
                    href="${escapeHtml(task.reference_url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    onclick="event.stopPropagation()"
                >
                    🔗
                    <span>Reference</span>
                    ↗
                </a>
            `
            : ""
    }

</div>

            <div class="task-meta">

                <span class="task-due">
                    Due:
                    ${escapeHtml(
                        formatDateOnly(
                            task.due_date
                        )
                    )}
                </span>

                <select
                    class="status-select"
                >

                    <option
                        value="Assigned"
                        ${
                            status ===
                            "Assigned"
                                ? "selected"
                                : ""
                        }
                    >
                        Assigned
                    </option>

                    <option
                        value="In Progress"
                        ${
                            status ===
                            "In Progress"
                                ? "selected"
                                : ""
                        }
                    >
                        In Progress
                    </option>

                    <option
                        value="Completed"
                        ${
                            status ===
                            "Completed"
                                ? "selected"
                                : ""
                        }
                    >
                        Completed
                    </option>

                </select>

            </div>
        `;


        const select =
            card.querySelector(
                ".status-select"
            );


        select.addEventListener(
            "change",
            async event => {

                event.stopPropagation();

                const newStatus =
                    select.value;

                try {

                    await api(
                        `/api/tasks/${task.id}`,
                        {
                            method: "PATCH",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    status:
                                        newStatus
                                })
                        }
                    );

                    await loadTasks();

                    if (
                        me?.role ===
                        "head"
                    ) {

                        await loadAudit();
                    }

                } catch (error) {

                    alert(
                        error.message
                    );

                    select.value =
                        task.status ||
                        "Assigned";
                }
            }
        );


        card.addEventListener(
            "click",
            event => {

                if (
                    event.target.tagName ===
                        "SELECT" ||
                    event.target.tagName ===
                        "OPTION"
                ) {

                    return;
                }

                openTaskModal(task);
            }
        );


        list.appendChild(card);
    });


    renderCalendar();
}


// =========================================================
// MEMBERS
// =========================================================

async function loadMembers() {

    try {

        const data =
            await api(
                "/api/members"
            );

        const memberList =
            document.getElementById(
                "memberList"
            );

        if (!memberList) {
            return;
        }

        memberList.innerHTML = "";


        data.forEach(member => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "member-row";


            row.innerHTML = `

                <div>

                    <strong>
                        ${escapeHtml(
                            member.name
                        )}
                    </strong>

                    <span>
                        ${escapeHtml(
                            member.team_member_id
                        )}
                        ·
                        ${escapeHtml(
                            member.email
                        )}
                        ·
                        ${escapeHtml(
                            member.phone
                        )}
                    </span>

                </div>


                <button
                    type="button"
                    class="ghost-btn"
                >
                    ${
                        member.active
                            ? "Disable"
                            : "Enable"
                    }
                </button>

            `;


            const button =
                row.querySelector(
                    "button"
                );


            button.addEventListener(
                "click",
                () => {

                    toggleMember(
                        member.id,
                        !member.active
                    );
                }
            );


            memberList.appendChild(
                row
            );
        });

    } catch (error) {

        console.error(
            "Failed to load members:",
            error
        );
    }
}


// =========================================================
// TOGGLE MEMBER
// =========================================================

async function toggleMember(
    id,
    active
) {

    try {

        await api(
            `/api/members/${id}/status`,
            {
                method: "PATCH",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        active
                    })
            }
        );

        await loadMembers();

        await loadTaskMembers();

        await loadAudit();

    } catch (error) {

        alert(
            error.message
        );
    }
}


// =========================================================
// TASK MEMBER SELECTOR
// =========================================================

async function loadTaskMembers() {

    const list =
        document.getElementById(
            "memberCheckboxList"
        );

    if (!list) {
        return;
    }


    try {

        const data =
            await api(
                "/api/members"
            );

        availableMembers =
            Array.isArray(data)
                ? data
                : (
                    data.members ||
                    []
                );

        renderTaskMembers();

    } catch (error) {

        console.error(
            "Failed to load task members:",
            error
        );

        list.innerHTML = `
            <div class="member-loading">
                Unable to load team members.
            </div>
        `;
    }
}


// =========================================================
// RENDER TASK MEMBERS
// =========================================================

function renderTaskMembers() {

    const list =
        document.getElementById(
            "memberCheckboxList"
        );

    if (!list) {
        return;
    }


    const activeMembers =
        availableMembers.filter(
            member =>
                member.active !== false
        );


    if (!activeMembers.length) {

        list.innerHTML = `
            <div class="member-loading">
                No active team members available.
            </div>
        `;

        updateSelectedMemberCount();

        return;
    }


    list.innerHTML = "";


    activeMembers.forEach(
        member => {

            const wrapper =
                document.createElement(
                    "label"
                );

            wrapper.className =
                "member-checkbox";


            wrapper.innerHTML = `

                <input
                    type="checkbox"
                    class="member-select"
                    value="${escapeHtml(
                        member.id
                    )}"
                    data-team-id="${escapeHtml(
                        member.team_member_id
                    )}"
                >

                <div
                    class="member-checkbox-info"
                >

                    <span
                        class="member-checkbox-name"
                    >
                        ${escapeHtml(
                            member.name
                        )}
                    </span>

                    <span
                        class="member-checkbox-id"
                    >
                        ${escapeHtml(
                            member.team_member_id
                        )}
                    </span>

                </div>

                <span
                    class="member-checkbox-email"
                >
                    ${escapeHtml(
                        member.email
                    )}
                </span>

            `;


            list.appendChild(
                wrapper
            );
        }
    );


    document
        .querySelectorAll(
            ".member-select"
        )
        .forEach(
            checkbox => {

                checkbox.addEventListener(
                    "change",
                    updateSelectedMemberCount
                );
            }
        );


    updateSelectedMemberCount();
}


// =========================================================
// SELECTED MEMBER IDS
// =========================================================

function getSelectedMemberIds() {

    return Array.from(
        document.querySelectorAll(
            ".member-select:checked"
        )
    ).map(
        checkbox =>
            checkbox.value
    );
}


// =========================================================
// MEMBER COUNT
// =========================================================

function updateSelectedMemberCount() {

    const count =
        document.getElementById(
            "selectedMemberCount"
        );

    if (!count) {
        return;
    }


    if (
        assignmentMode ===
        "all"
    ) {

        const activeCount =
            availableMembers.filter(
                member =>
                    member.active !== false
            ).length;

        count.textContent =
            `${activeCount} members`;

        return;
    }


    const selected =
        getSelectedMemberIds();

    count.textContent =
        `${selected.length} selected`;
}


// =========================================================
// ASSIGNMENT MODE
// =========================================================

document
    .getElementById(
        "specificMembersBtn"
    )
    ?.addEventListener(
        "click",
        function () {

            assignmentMode =
                "members";

            this.classList.add(
                "active"
            );

            document
                .getElementById(
                    "allMembersBtn"
                )
                ?.classList.remove(
                    "active"
                );

            document
                .getElementById(
                    "memberSelector"
                )
                ?.classList.remove(
                    "hidden"
                );

            updateSelectedMemberCount();
        }
    );


document
    .getElementById(
        "allMembersBtn"
    )
    ?.addEventListener(
        "click",
        function () {

            assignmentMode =
                "all";

            this.classList.add(
                "active"
            );

            document
                .getElementById(
                    "specificMembersBtn"
                )
                ?.classList.remove(
                    "active"
                );

            document
                .getElementById(
                    "memberSelector"
                )
                ?.classList.add(
                    "hidden"
                );

            updateSelectedMemberCount();
        }
    );


// =========================================================
// SELECT ALL
// =========================================================

document
    .getElementById(
        "selectAllMembers"
    )
    ?.addEventListener(
        "click",
        function () {

            document
                .querySelectorAll(
                    ".member-select"
                )
                .forEach(
                    checkbox => {
                        checkbox.checked =
                            true;
                    }
                );

            updateSelectedMemberCount();
        }
    );


// =========================================================
// CLEAR ALL
// =========================================================

document
    .getElementById(
        "clearAllMembers"
    )
    ?.addEventListener(
        "click",
        function () {

            document
                .querySelectorAll(
                    ".member-select"
                )
                .forEach(
                    checkbox => {
                        checkbox.checked =
                            false;
                    }
                );

            updateSelectedMemberCount();
        }
    );


// =========================================================
// CREATE TASK
// =========================================================

document
    .getElementById(
        "taskForm"
    )
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            let assignedTo = [];


            if (
                assignmentMode ===
                "all"
            ) {

                assignedTo =
                    availableMembers
                        .filter(
                            member =>
                                member.active !==
                                false
                        )
                        .map(
                            member =>
                                member.id
                        );

            } else {

                assignedTo =
                    getSelectedMemberIds();
            }


            // -------------------------------------------------
            // VALIDATE ASSIGNEES
            // -------------------------------------------------

            if (!assignedTo.length) {

                alert(
                    "Please select at least one team member."
                );

                return;
            }


            const title =
                document.getElementById(
                    "taskTitle"
                )?.value.trim() || "";


            const description =
                document.getElementById(
                    "taskDescription"
                )?.value.trim() || "";


            const dueDate =
                document.getElementById(
                    "dueDate"
                )?.value || "";


            if (!title) {

                alert(
                    "Please enter a task title."
                );

                return;
            }


            // -------------------------------------------------
            // DISABLE BUTTON
            // -------------------------------------------------

            const submitButton =
                event.target.querySelector(
                    'button[type="submit"]'
                );

            const originalText =
                submitButton?.textContent;


            if (submitButton) {

                submitButton.disabled =
                    true;

                submitButton.textContent =
                    "Assigning...";
            }


            try {

                const result =
                    await api(
                        "/api/tasks",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

                                    title,

                                    description,

                                    assigned_to:
                                        assignedTo,

                                    due_date:
                                        dueDate,
                                    canva_url:
                                        canvaUrl,
                            
                                    assets_folder_url:
                                        assetsFolderUrl,
                            
                                    reference_url:
                                        referenceUrl
                                    })
                    );


                // -------------------------------------------------
                // RESET FORM
                // -------------------------------------------------

                event.target.reset();


                selectedDateValue =
                    null;

                const selectedDateLabel =
                    document.getElementById(
                        "selectedDate"
                    );

                if (selectedDateLabel) {

                    selectedDateLabel.textContent =
                        "Select due date";
                }


                const dueDateInput =
                    document.getElementById(
                        "dueDate"
                    );

                if (dueDateInput) {

                    dueDateInput.value =
                        "";
                }


                document
                    .querySelectorAll(
                        ".member-select"
                    )
                    .forEach(
                        checkbox => {
                            checkbox.checked =
                                false;
                        }
                    );


                assignmentMode =
                    "members";


                document
                    .getElementById(
                        "specificMembersBtn"
                    )
                    ?.classList.add(
                        "active"
                    );


                document
                    .getElementById(
                        "allMembersBtn"
                    )
                    ?.classList.remove(
                        "active"
                    );


                document
                    .getElementById(
                        "memberSelector"
                    )
                    ?.classList.remove(
                        "hidden"
                    );


                updateSelectedMemberCount();

                renderDatePicker();


                // -------------------------------------------------
                // REFRESH
                // -------------------------------------------------

                await loadTasks();

                await loadAudit();


                const assignedCount =
                    result.assigned_count ||
                    assignedTo.length;


                const notificationCount =
                    result.notification_count ||
                    0;


                alert(
                    `Task assigned successfully to ` +
                    `${assignedCount} member${
                        assignedCount === 1
                            ? ""
                            : "s"
                    }.\n\n` +
                    `Email notifications sent: ` +
                    `${notificationCount}/${assignedCount}.`
                );


            } catch (error) {

                console.error(
                    "TASK ASSIGNMENT ERROR:",
                    error
                );

                alert(
                    error.message ||
                    "Task could not be assigned."
                );

            } finally {

                if (submitButton) {

                    submitButton.disabled =
                        false;

                    submitButton.textContent =
                        originalText ||
                        "Assign Task";
                }
            }
        }
    );


// =========================================================
// MEMBER MANAGEMENT FORM
// =========================================================

document
    .getElementById(
        "memberFormAdmin"
    )
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            try {

                await api(
                    "/api/members",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                name:
                                    document
                                        .getElementById(
                                            "newName"
                                        )
                                        ?.value || "",

                                email:
                                    document
                                        .getElementById(
                                            "newEmail"
                                        )
                                        ?.value || "",

                                phone:
                                    document
                                        .getElementById(
                                            "newPhone"
                                        )
                                        ?.value || "",

                                team_member_id:
                                    document
                                        .getElementById(
                                            "newMemberId"
                                        )
                                        ?.value || ""
                            })
                    }
                );


                event.target.reset();

                await loadMembers();

                await loadTaskMembers();

                await loadAudit();


                alert(
                    "Team member added successfully."
                );


            } catch (error) {

                alert(
                    error.message
                );
            }
        }
    );


// =========================================================
// LOGOUT
// =========================================================

document
    .getElementById(
        "logoutBtn"
    )
    ?.addEventListener(
        "click",
        async () => {

            try {

                await api(
                    "/api/logout",
                    {
                        method: "POST"
                    }
                );

            } catch (error) {

                console.error(
                    "Logout failed:",
                    error
                );

            } finally {

                location.href = "/";
            }
        }
    );


// =========================================================
// AUDIT
// =========================================================

async function loadAudit() {

    try {

        const data =
            await api(
                "/api/audit"
            );

        renderAudit(data);

    } catch (error) {

        console.error(
            "Failed to load audit:",
            error
        );
    }
}


function formatAuditAction(action) {

    const actionMap = {

        "HEAD_LOGIN_SUCCESS":
            "Head signed in",

        "HEAD_LOGIN_FAILED":
            "Failed head login",

        "MEMBER_LOGIN_SUCCESS":
            "Member signed in",

        "MEMBER_LOGIN_FAILED":
            "Failed member login",

        "LOGOUT":
            "Signed out",

        "TASK_CREATED":
            "Task assigned",

        "TASK_STATUS_UPDATED":
            "Task status updated",

        "MEMBER_CREATED":
            "Team member added",

        "MEMBER_STATUS_UPDATED":
            "Member status changed"
    };


    return (
        actionMap[action] ||
        action ||
        "Activity"
    );
}


function renderAudit(logs = []) {

    const container =
        document.getElementById(
            "auditList"
        );

    const count =
        document.getElementById(
            "auditCount"
        );


    if (!container) {
        return;
    }


    if (count) {

        count.textContent =
            `${logs.length} event${
                logs.length === 1
                    ? ""
                    : "s"
            }`;
    }


    if (!logs.length) {

        container.innerHTML = `
            <div class="audit-empty">
                No security events recorded.
            </div>
        `;

        return;
    }


    container.innerHTML = "";


    logs.forEach(log => {

        const item =
            document.createElement(
                "div"
            );

        item.className =
            "audit-item";


        const action =
            log.action ||
            "Activity";


        const metadata =
            log.metadata ||
            {};


        const user =
            metadata.name ||
            metadata.email ||
            metadata.team_member_id ||
            log.user_id ||
            "System";


        const timestamp =
            log.created_at;


        item.innerHTML = `

            <div class="audit-dot"></div>

            <div class="audit-content">

                <div class="audit-action">
                    ${escapeHtml(
                        formatAuditAction(
                            action
                        )
                    )}
                </div>

                <div class="audit-user">
                    ${escapeHtml(
                        user
                    )}
                </div>

                ${
                    metadata.member_count
                        ? `
                            <div class="audit-detail">
                                ${escapeHtml(
                                    String(
                                        metadata.member_count
                                    )
                                )}
                                members assigned
                            </div>
                          `
                        : ""
                }

                ${
                    log.ip
                        ? `
                            <div class="audit-ip">
                                IP:
                                ${escapeHtml(
                                    log.ip
                                )}
                            </div>
                          `
                        : ""
                }

            </div>

            <div
                class="audit-time"
                title="${escapeHtml(
                    formatDateTime(
                        timestamp
                    )
                )}"
            >
                ${escapeHtml(
                    relativeTime(
                        timestamp
                    )
                )}

                <br>

                ${escapeHtml(
                    formatDateTime(
                        timestamp
                    )
                )}
            </div>

        `;


        container.appendChild(
            item
        );
    });
}


// =========================================================
// CUSTOM DATE PICKER
// =========================================================

const datePickerButton =
    document.getElementById(
        "datePickerButton"
    );

const datePicker =
    document.getElementById(
        "datePicker"
    );

const dateGrid =
    document.getElementById(
        "dateGrid"
    );

const dateMonth =
    document.getElementById(
        "dateMonth"
    );

const selectedDate =
    document.getElementById(
        "selectedDate"
    );

const dueDateInput =
    document.getElementById(
        "dueDate"
    );
const canvaUrl =
    document.getElementById(
        "taskCanvaUrl"
    )?.value.trim() || "";

const assetsFolderUrl =
    document.getElementById(
        "taskAssetsFolderUrl"
    )?.value.trim() || "";

const referenceUrl =
    document.getElementById(
        "taskReferenceUrl"
    )?.value.trim() || "";


// =========================================================
// OPEN / CLOSE
// =========================================================

datePickerButton
    ?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            if (!datePicker) {
                return;
            }

            datePicker.classList.toggle(
                "hidden"
            );

            datePickerButton.classList.toggle(
                "active",
                !datePicker.classList.contains(
                    "hidden"
                )
            );

            renderDatePicker();
        }
    );


// =========================================================
// PREVIOUS MONTH
// =========================================================

document
    .getElementById(
        "datePrev"
    )
    ?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            pickerDate.setMonth(
                pickerDate.getMonth() - 1
            );

            renderDatePicker();
        }
    );


// =========================================================
// NEXT MONTH
// =========================================================

document
    .getElementById(
        "dateNext"
    )
    ?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            pickerDate.setMonth(
                pickerDate.getMonth() + 1
            );

            renderDatePicker();
        }
    );


// =========================================================
// TODAY
// =========================================================

document
    .getElementById(
        "selectToday"
    )
    ?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            const today =
                new Date();

            pickerDate =
                new Date(today);

            setSelectedDate(
                today
            );

            if (datePicker) {

                datePicker.classList.add(
                    "hidden"
                );
            }

            if (datePickerButton) {

                datePickerButton.classList.remove(
                    "active"
                );
            }

            renderDatePicker();
        }
    );


// =========================================================
// CLEAR DATE
// =========================================================

document
    .getElementById(
        "clearDate"
    )
    ?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            selectedDateValue =
                null;

            if (dueDateInput) {

                dueDateInput.value =
                    "";
            }

            if (selectedDate) {

                selectedDate.textContent =
                    "Select due date";
            }

            renderDatePicker();
        }
    );


// =========================================================
// CLOSE OUTSIDE
// =========================================================

document.addEventListener(
    "click",
    event => {

        if (
            datePicker &&
            datePickerButton &&
            !datePicker.contains(
                event.target
            ) &&
            !datePickerButton.contains(
                event.target
            )
        ) {

            datePicker.classList.add(
                "hidden"
            );

            datePickerButton.classList.remove(
                "active"
            );
        }
    }
);


// =========================================================
// RENDER DATE PICKER
// =========================================================

function renderDatePicker() {

    if (
        !dateGrid ||
        !dateMonth
    ) {
        return;
    }


    const year =
        pickerDate.getFullYear();

    const month =
        pickerDate.getMonth();


    dateMonth.textContent =
        new Intl.DateTimeFormat(
            "en-IN",
            {
                month: "long",
                year: "numeric"
            }
        ).format(
            pickerDate
        );


    dateGrid.innerHTML = "";


    const firstDay =
        new Date(
            year,
            month,
            1
        ).getDay();


    const daysInMonth =
        new Date(
            year,
            month + 1,
            0
        ).getDate();


    const previousMonthDays =
        new Date(
            year,
            month,
            0
        ).getDate();


    // -----------------------------------------------------
    // PREVIOUS MONTH
    // -----------------------------------------------------

    for (
        let i = firstDay - 1;
        i >= 0;
        i--
    ) {

        const day =
            document.createElement(
                "div"
            );

        day.className =
            "date-day other-month";

        day.textContent =
            previousMonthDays - i;

        dateGrid.appendChild(day);
    }


    // -----------------------------------------------------
    // CURRENT MONTH
    // -----------------------------------------------------

    const today =
        new Date();


    for (
        let dayNumber = 1;
        dayNumber <= daysInMonth;
        dayNumber++
    ) {

        const day =
            document.createElement(
                "div"
            );

        day.className =
            "date-day";

        day.textContent =
            dayNumber;


        const currentDay =
            new Date(
                year,
                month,
                dayNumber
            );


        if (
            currentDay.getDate() ===
                today.getDate() &&
            currentDay.getMonth() ===
                today.getMonth() &&
            currentDay.getFullYear() ===
                today.getFullYear()
        ) {

            day.classList.add(
                "today"
            );
        }


        if (
            selectedDateValue &&
            currentDay.getFullYear() ===
                selectedDateValue.getFullYear() &&
            currentDay.getMonth() ===
                selectedDateValue.getMonth() &&
            currentDay.getDate() ===
                selectedDateValue.getDate()
        ) {

            day.classList.add(
                "selected"
            );
        }


        day.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                setSelectedDate(
                    currentDay
                );

                datePicker?.classList.add(
                    "hidden"
                );

                datePickerButton?.classList.remove(
                    "active"
                );
            }
        );


        dateGrid.appendChild(day);
    }


    // -----------------------------------------------------
    // REMAINING
    // -----------------------------------------------------

    const totalCells =
        firstDay +
        daysInMonth;


    const remaining =
        (
            7 -
            (totalCells % 7)
        ) % 7;


    for (
        let i = 1;
        i <= remaining;
        i++
    ) {

        const day =
            document.createElement(
                "div"
            );

        day.className =
            "date-day other-month";

        day.textContent =
            i;

        dateGrid.appendChild(day);
    }
}


// =========================================================
// SET DATE
// =========================================================

function setSelectedDate(date) {

    selectedDateValue =
        new Date(date);


    if (selectedDate) {

        selectedDate.textContent =
            new Intl.DateTimeFormat(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                }
            ).format(date);
    }


    if (dueDateInput) {

        const year =
            date.getFullYear();

        const month =
            String(
                date.getMonth() + 1
            ).padStart(
                2,
                "0"
            );

        const day =
            String(
                date.getDate()
            ).padStart(
                2,
                "0"
            );


        dueDateInput.value =
            `${year}-${month}-${day}`;
    }
}


// =========================================================
// START
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {
        init();
    }
);
