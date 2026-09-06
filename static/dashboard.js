/* =========================================================
   TECHNICAL TEAM DASHBOARD
   CLEAN FRONTEND CONTROLLER
   ========================================================= */

"use strict";

/* =========================================================
   GLOBAL STATE
   ========================================================= */

let me = null;
let tasks = [];
let availableMembers = [];

let currentCalendarDate = new Date();

let assignmentMode = "members";

let pickerDate = new Date();
let selectedDateValue = null;


/* =========================================================
   API
   ========================================================= */

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
            data.error || "Request failed"
        );
    }

    return data;
}

/* =========================================================
   PWA / PUSH NOTIFICATIONS
   ========================================================= */

let pushRegistration = null;
let pushSubscription = null;


/* =========================================================
   REGISTER SERVICE WORKER
   ========================================================= */

async function registerPWA() {

    if (!("serviceWorker" in navigator)) {

        console.warn(
            "Service Worker is not supported."
        );

        return null;
    }

    try {

        pushRegistration =
            await navigator.serviceWorker.register(
                "/static/sw.js",
                {
                    scope: "/"
                }
            );

        console.log(
            "PWA service worker registered."
        );

        return pushRegistration;

    } catch (error) {

        console.error(
            "Service Worker registration failed:",
            error
        );

        return null;
    }
}

async function getPushPublicKey() {

    const result =
        await api(
            "/api/push/public-key"
        );

    return result.public_key;
}

function urlBase64ToUint8Array(
    base64String
) {

    const padding =
        "=".repeat(
            (4 - base64String.length % 4) % 4
        );

    const base64 =
        (
            base64String +
            padding
        )
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    const rawData =
        window.atob(base64);

    return Uint8Array.from(
        [...rawData].map(
            char =>
                char.charCodeAt(0)
        )
    );
}

async function subscribeToPush() {

    if (
        !("Notification" in window)
    ) {

        throw new Error(
            "This browser does not support notifications."
        );

    }


    if (
        !("serviceWorker" in navigator)
    ) {

        throw new Error(
            "Service Worker is not supported."
        );

    }


    const registration =
        pushRegistration ||
        await registerPWA();


    if (!registration) {

        throw new Error(
            "Could not register PWA."
        );

    }


    const permission =
        await Notification.requestPermission();


    if (
        permission !== "granted"
    ) {

        throw new Error(
            "Notification permission was not granted."
        );

    }


    const publicKey =
        await getPushPublicKey();


    pushSubscription =
        await registration.pushManager.subscribe({

            userVisibleOnly: true,

            applicationServerKey:
                urlBase64ToUint8Array(
                    publicKey
                )

        });


    await api(
        "/api/push/subscribe",
        {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                subscription:
                    pushSubscription.toJSON()

            })

        }
    );


    localStorage.setItem(
        "pushNotificationsEnabled",
        "true"
    );


    console.log(
        "Push notifications enabled."
    );


    return true;
}


function showPushPermissionModal() {

    const modal =
        document.getElementById(
            "pushPermissionModal"
        );

    if (!modal) {
        return;
    }

    modal.classList.remove(
        "hidden"
    );
}


function hidePushPermissionModal() {
    const modal = document.getElementById("pushPermissionModal");

    if (modal) {
        modal.classList.remove("show");
        modal.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {

    const closeBtn = document.getElementById("closePushModal");
    const skipBtn = document.getElementById("skipPushBtn");

    if (closeBtn) {
        closeBtn.addEventListener("click", hidePushPermissionModal);
    }

    if (skipBtn) {
        skipBtn.addEventListener("click", hidePushPermissionModal);
    }

});


async function initializePushNotifications() {

    await registerPWA();


    if (
        !("Notification" in window)
    ) {
        return;
    }


    if (
        Notification.permission ===
        "granted"
    ) {

        try {

            await subscribeToPush();

        } catch (error) {

            console.error(
                "Automatic push subscription failed:",
                error
            );

        }

        return;
    }


   if (Notification.permission === "default") {
    showPushPermissionModal();
}
document.getElementById("skipPushBtn")?.addEventListener("click", () => {
    localStorage.setItem("pushPromptDismissed", "true");
    hidePushPermissionModal();
});
function initializePushNotifications() {

    if (!("Notification" in window)) {
        return;
    }

    if (Notification.permission === "granted") {
        subscribeToPush();
        return;
    }

    if (
        Notification.permission === "default" &&
        localStorage.getItem("pushPromptDismissed") !== "true"
    ) {
        showPushPermissionModal();
    }
}

document
    .getElementById(
        "enablePushBtn"
    )
    ?.addEventListener(
        "click",
        async () => {

            const button =
                document.getElementById(
                    "enablePushBtn"
                );


            if (button) {

                button.disabled = true;

                button.textContent =
                    "Enabling...";

            }


            try {

                await subscribeToPush();

                localStorage.setItem(
                    "pushPermissionAsked",
                    "true"
                );

                hidePushPermissionModal();


                showInAppNotification(
                    "Notifications Enabled",
                    "You will now receive task notifications.",
                    "success"
                );

            } catch (error) {

                console.error(
                    "Push permission error:",
                    error
                );

                alert(
                    error.message ||
                    "Could not enable notifications."
                );

            } finally {

                if (button) {

                    button.disabled = false;

                    button.textContent =
                        "Enable Notifications";

                }

            }

        }
    );

document
    .getElementById(
        "skipPushBtn"
    )
    ?.addEventListener(
        "click",
        () => {

            localStorage.setItem(
                "pushPermissionAsked",
                "true"
            );

            hidePushPermissionModal();

        }
    );


function showInAppNotification(
    title,
    message,
    type = "info",
    taskId = null
) {

    let container =
        document.getElementById(
            "inAppNotificationContainer"
        );


    if (!container) {

        container =
            document.createElement(
                "div"
            );

        container.id =
            "inAppNotificationContainer";

        container.className =
            "in-app-notification-container";

        document.body.appendChild(
            container
        );

    }


    const notification =
        document.createElement(
            "div"
        );

    notification.className =
        `in-app-notification ${type}`;


    notification.innerHTML = `

        <div class="in-app-notification-icon">
            🔔
        </div>

        <div class="in-app-notification-content">

            <strong>
                ${escapeHtml(title)}
            </strong>

            <p>
                ${escapeHtml(message)}
            </p>

        </div>

        <button
            type="button"
            class="in-app-notification-close"
        >
            ×
        </button>

    `;


    notification
        .querySelector(
            ".in-app-notification-close"
        )
        ?.addEventListener(
            "click",
            () => {

                notification.remove();

            }
        );


    if (taskId) {

        notification.addEventListener(
            "click",
            event => {

                if (
                    event.target.closest(
                        ".in-app-notification-close"
                    )
                ) {
                    return;
                }

                const task =
                    tasks.find(
                        item =>
                            String(item.id) ===
                            String(taskId)
                    );

                if (task) {

                    openTaskModal(task);

                }

                notification.remove();

            }
        );

    }


    container.appendChild(
        notification
    );


    setTimeout(
        () => {

            notification.remove();

        },
        10000
    );
}
/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

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
       Prevent timezone shifting for YYYY-MM-DD
    */

    if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        const [year, month, day] =
            value.split("-").map(Number);

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
        Date.now() - date.getTime();

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


/* =========================================================
   STATUS
   ========================================================= */

function getStatusClass(status) {
    switch (
        String(status || "").toLowerCase()
    ) {
        case "completed":
            return "completed";

        case "in progress":
            return "progress";

        default:
            return "assigned";
    }
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {
    console.log("Dashboard initialization started.");

    try {
        me = await api("/api/me");
        

        console.log(
            "Authenticated user:",
            me
        );
        await initializePushNotifications();

    } catch (error) {
        console.error(
            "Authentication check failed:",
            error
        );

        window.location.href = "/";
        return;
    }
   
   
function renderNotificationPanel() {

    const list =
        document.getElementById(
            "notificationList"
        );

    const badge =
        document.getElementById(
            "notificationBadge"
        );

    const count =
        document.getElementById(
            "notificationPanelCount"
        );


    if (!list) {
        return;
    }


    const recentTasks =
        [...tasks]
            .sort(
                (a, b) =>
                    new Date(
                        b.created_at || 0
                    ) -
                    new Date(
                        a.created_at || 0
                    )
            )
            .slice(0, 10);


    if (!recentTasks.length) {

        list.innerHTML = `
            <div class="notification-empty">
                No notifications yet.
            </div>
        `;

        if (badge) {
            badge.classList.add("hidden");
        }

        if (count) {
            count.textContent =
                "0 unread";
        }

        return;
    }


    const unreadKey =
        "readTaskNotifications";


    const readIds =
        JSON.parse(
            localStorage.getItem(
                unreadKey
            ) || "[]"
        );


    const unreadTasks =
        recentTasks.filter(
            task =>
                !readIds.includes(
                    String(task.id)
                )
        );


    if (badge) {

        if (unreadTasks.length) {

            badge.textContent =
                unreadTasks.length > 99
                    ? "99+"
                    : unreadTasks.length;

            badge.classList.remove(
                "hidden"
            );

        } else {

            badge.classList.add(
                "hidden"
            );

        }

    }


    if (count) {

        count.textContent =
            `${unreadTasks.length} unread`;

    }


    list.innerHTML =
        recentTasks
            .map(task => {

                const unread =
                    !readIds.includes(
                        String(task.id)
                    );

                return `

                    <div
                        class="
                            notification-item
                            ${unread ? "unread" : ""}
                        "
                        data-task-id="${escapeHtml(
                            task.id
                        )}"
                    >

                        <div
                            class="notification-item-icon"
                        >
                            🔔
                        </div>

                        <div
                            class="notification-item-content"
                        >

                            <strong>
                                New Task Assigned
                            </strong>

                            <p>
                                ${escapeHtml(
                                    task.title
                                )}
                            </p>

                            <small>
                                ${escapeHtml(
                                    relativeTime(
                                        task.created_at
                                    )
                                )}
                            </small>

                        </div>

                    </div>
                `;

            })
            .join("");


    list
        .querySelectorAll(
            ".notification-item"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    const id =
                        item.dataset.taskId;

                    const task =
                        tasks.find(
                            item =>
                                String(
                                    item.id
                                ) ===
                                String(id)
                        );

                    if (task) {

                        markTaskNotificationRead(
                            id
                        );

                        openTaskModal(
                            task
                        );

                    }

                }
            );

        });
}

function markTaskNotificationRead(
    taskId
) {

    const key =
        "readTaskNotifications";


    const readIds =
        JSON.parse(
            localStorage.getItem(key) ||
            "[]"
        );


    if (
        !readIds.includes(
            String(taskId)
        )
    ) {

        readIds.push(
            String(taskId)
        );

    }


    localStorage.setItem(
        key,
        JSON.stringify(readIds)
    );


    renderNotificationPanel();
}

document
    .getElementById(
        "notificationBell"
    )
    ?.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            const panel =
                document.getElementById(
                    "notificationPanel"
                );

            if (!panel) {
                return;
            }

            panel.classList.toggle(
                "hidden"
            );

        }
    );

document.addEventListener(
    "click",
    event => {

        const panel =
            document.getElementById(
                "notificationPanel"
            );

        const bell =
            document.getElementById(
                "notificationBell"
            );

        if (
            panel &&
            !panel.contains(
                event.target
            ) &&
            !bell?.contains(
                event.target
            )
        ) {

            panel.classList.add(
                "hidden"
            );

        }

    }
);

document
    .getElementById(
        "markNotificationsRead"
    )
    ?.addEventListener(
        "click",
        () => {

            const key =
                "readTaskNotifications";


            const ids =
                tasks.map(
                    task =>
                        String(task.id)
                );


            localStorage.setItem(
                key,
                JSON.stringify(ids)
            );


            renderNotificationPanel();

        }
    );

    /* -----------------------------------------------------
       USER INFORMATION
       ----------------------------------------------------- */

    const userName =
        document.getElementById("userName");

    const roleBadge =
        document.getElementById("roleBadge");


    if (userName) {
        userName.textContent =
            me.name || "";
    }


    if (roleBadge) {
        roleBadge.textContent =
            me.role === "head"
                ? "HEAD"
                : (
                    me.team_member_id ||
                    "MEMBER"
                );
    }


    /* -----------------------------------------------------
       LOAD GLOBAL RESOURCES
       ----------------------------------------------------- */

    await loadGlobalResources();


    /* -----------------------------------------------------
       HEAD ONLY
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       TASKS
       ----------------------------------------------------- */

    await loadTasks();


    /* -----------------------------------------------------
       DATE PICKER
       ----------------------------------------------------- */

    renderDatePicker();

    console.log(
        "Dashboard initialization completed."
    );
}


/* =========================================================
   GLOBAL RESOURCES
   ========================================================= */

async function loadGlobalResources() {
    try {

        const resources =
            await api("/api/resources");

        const waCard =
            document.getElementById("waCard");

        const canvaCard =
            document.getElementById("canvaCard");

        const folderCard =
            document.getElementById("folderCard");


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
            "Failed to load global resources:",
            error
        );
    }
}


/* =========================================================
   CALENDAR
   ========================================================= */

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


    /* -----------------------------------------------------
       PREVIOUS MONTH
       ----------------------------------------------------- */

    for (
        let i = firstDay;
        i > 0;
        i--
    ) {

        const cell =
            document.createElement("div");

        cell.className =
            "calendar-day other-month";

        cell.innerHTML = `
            <span class="day-number">
                ${previousMonthDays - i + 1}
            </span>
        `;

        grid.appendChild(cell);
    }


    /* -----------------------------------------------------
       CURRENT MONTH
       ----------------------------------------------------- */

    const today = new Date();


    for (
        let dayNumber = 1;
        dayNumber <= daysInMonth;
        dayNumber++
    ) {

        const cell =
            document.createElement("div");

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


        /* -------------------------------------------------
           TASKS ON THIS DATE
           ------------------------------------------------- */

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

                    const [y, m, d] =
                        task.due_date
                            .split("-")
                            .map(Number);

                    due =
                        new Date(
                            y,
                            m - 1,
                            d
                        );

                } else {

                    due =
                        new Date(
                            task.due_date
                        );
                }


                return (
                    due.getFullYear() ===
                        year &&
                    due.getMonth() ===
                        month &&
                    due.getDate() ===
                        dayNumber
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
                    `calendar-task ${getStatusClass(task.status)}`;

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


    /* -----------------------------------------------------
       NEXT MONTH
       ----------------------------------------------------- */

    const totalCells =
        firstDay + daysInMonth;

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
            document.createElement("div");

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


/* =========================================================
   CALENDAR CONTROLS
   ========================================================= */

document
    .getElementById("prevMonth")
    ?.addEventListener(
        "click",
        () => {

            currentCalendarDate.setMonth(
                currentCalendarDate.getMonth() - 1
            );

            renderCalendar();
        }
    );


document
    .getElementById("nextMonth")
    ?.addEventListener(
        "click",
        () => {

            currentCalendarDate.setMonth(
                currentCalendarDate.getMonth() + 1
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


/* =========================================================
   TASK MEMBERS
   ========================================================= */

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


    return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}


/* =========================================================
   LOAD TASKS
   ========================================================= */

async function loadTasks() {

    try {

        tasks =
            await api(
                "/api/tasks"
            );


        if (!Array.isArray(tasks)) {
            tasks = [];
        }


        renderTasks();

        renderNotificationPanel();

    } catch (error) {

        console.error(
            "Failed to load tasks:",
            error
        );

    }

}

/* =========================================================
   RENDER TASKS
   ========================================================= */

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
            `${tasks.length} task${tasks.length === 1 ? "" : "s"}`;
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
                    ${escapeHtml(status)}
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


                <select class="status-select">

                    <option
                        value="Assigned"
                        ${status === "Assigned" ? "selected" : ""}
                    >
                        Assigned
                    </option>

                    <option
                        value="In Progress"
                        ${status === "In Progress" ? "selected" : ""}
                    >
                        In Progress
                    </option>

                    <option
                        value="Completed"
                        ${status === "Completed" ? "selected" : ""}
                    >
                        Completed
                    </option>

                </select>

            </div>
        `;


        /* -------------------------------------------------
           RESOURCE LINKS MUST NOT OPEN TASK MODAL
           ------------------------------------------------- */

        card
            .querySelectorAll(
                ".task-resource-btn"
            )
            .forEach(link => {

                link.addEventListener(
                    "click",
                    event => {
                        event.stopPropagation();
                    }
                );
            });


        /* -------------------------------------------------
           STATUS
           ------------------------------------------------- */

        const select =
            card.querySelector(
                ".status-select"
            );


        if (select) {

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
        }


        /* -------------------------------------------------
           CARD CLICK
           ------------------------------------------------- */

        card.addEventListener(
            "click",
            event => {

                if (
                    event.target.closest(
                        ".status-select"
                    ) ||
                    event.target.closest(
                        ".task-resource-btn"
                    )
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


/* =========================================================
   TASK MODAL
   ========================================================= */

function openTaskModal(task) {

    const modal =
        document.getElementById(
            "taskModal"
        );

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

    const resourcesEl =
        document.getElementById(
            "modalTaskResources"
        );


    /* -----------------------------------------------------
       BASIC INFORMATION
       ----------------------------------------------------- */

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


    if (dueEl) {
        dueEl.textContent =
            formatDateOnly(
                task.due_date
            );
    }


    /* -----------------------------------------------------
       ASSIGNEES
       ----------------------------------------------------- */

    if (assigneeEl) {

        const members =
            getTaskMembers(task);


        if (!members.length) {

            assigneeEl.textContent =
                "—";

        } else {

            assigneeEl.innerHTML =
                members
                    .map(member => {

                        const name =
                            member.member_name ||
                            member.name ||
                            "Member";

                        const email =
                            member.member_email ||
                            member.email ||
                            "";


                        return `
                            <div>
                                <strong>
                                    ${escapeHtml(name)}
                                </strong>

                                ${
                                    email
                                        ? `
                                            <small>
                                                ${escapeHtml(email)}
                                            </small>
                                        `
                                        : ""
                                }
                            </div>
                        `;
                    })
                    .join("");
        }
    }


    /* -----------------------------------------------------
       TASK RESOURCES
       ----------------------------------------------------- */

    if (resourcesEl) {

        const resourceButtons = [];


        if (task.canva_url) {

            resourceButtons.push(`
                <a
                    href="${escapeHtml(task.canva_url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="task-resource-btn canva-resource"
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
                    class="task-resource-btn folder-resource"
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
                    class="task-resource-btn reference-resource"
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


    /* -----------------------------------------------------
       OPEN
       ----------------------------------------------------- */

    if (modal) {
        modal.classList.remove(
            "hidden"
        );
    }
}


/* =========================================================
   CLOSE TASK MODAL
   ========================================================= */

document
    .getElementById("closeTaskModal")
    ?.addEventListener(
        "click",
        () => {

            document
                .getElementById("taskModal")
                ?.classList.add(
                    "hidden"
                );
        }
    );


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


/* =========================================================
   MEMBERS MANAGEMENT
   ========================================================= */

async function loadMembers() {

    try {

        const data =
            await api("/api/members");


        const memberList =
            document.getElementById(
                "memberList"
            );


        if (!memberList) {
            return;
        }


        memberList.innerHTML = "";


        const members =
            Array.isArray(data)
                ? data
                : (
                    data.members ||
                    []
                );


        if (!members.length) {

            memberList.innerHTML = `
                <div class="audit-empty">
                    No team members found.
                </div>
            `;

            return;
        }


        members.forEach(member => {

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


            button?.addEventListener(
                "click",
                () => {

                    toggleMember(
                        member.id,
                        !member.active
                    );
                }
            );


            memberList.appendChild(row);
        });

    } catch (error) {

        console.error(
            "Failed to load members:",
            error
        );
    }
}


/* =========================================================
   TOGGLE MEMBER
   ========================================================= */

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


/* =========================================================
   TASK MEMBER SELECTOR
   ========================================================= */

async function loadTaskMembers() {

    const list =
        document.getElementById(
            "memberCheckboxList"
        );


    if (!list) {
        return;
    }


    list.innerHTML = `
        <div class="member-loading">
            Loading team members...
        </div>
    `;


    try {

        const data =
            await api("/api/members");


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


/* =========================================================
   RENDER TASK MEMBERS
   ========================================================= */

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


    activeMembers.forEach(member => {

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
                value="${escapeHtml(member.id)}"
                data-team-id="${escapeHtml(member.team_member_id)}"
            >

            <div class="member-checkbox-info">

                <span class="member-checkbox-name">
                    ${escapeHtml(
                        member.name
                    )}
                </span>

                <span class="member-checkbox-id">
                    ${escapeHtml(
                        member.team_member_id
                    )}
                </span>

            </div>

            <span class="member-checkbox-email">
                ${escapeHtml(
                    member.email
                )}
            </span>
        `;


        list.appendChild(wrapper);
    });


    list
        .querySelectorAll(
            ".member-select"
        )
        .forEach(checkbox => {

            checkbox.addEventListener(
                "change",
                updateSelectedMemberCount
            );
        });


    updateSelectedMemberCount();
}


/* =========================================================
   SELECTED MEMBER IDS
   ========================================================= */

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


/* =========================================================
   MEMBER COUNT
   ========================================================= */

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


/* =========================================================
   ASSIGNMENT MODE
   ========================================================= */

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


/* =========================================================
   SELECT ALL
   ========================================================= */

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


/* =========================================================
   CLEAR ALL
   ========================================================= */

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


/* =========================================================
   CREATE TASK
   ========================================================= */

document
    .getElementById(
        "taskForm"
    )
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            /* -------------------------------------------------
               ASSIGNEES
               ------------------------------------------------- */

            let assignedTo = [];


            if (
                assignmentMode ===
                "all"
            ) {

                assignedTo =
                    availableMembers
                        .filter(
                            member =>
                                member.active !== false
                        )
                        .map(
                            member =>
                                member.id
                        );

            } else {

                assignedTo =
                    getSelectedMemberIds();
            }


            if (!assignedTo.length) {

                alert(
                    "Please select at least one team member."
                );

                return;
            }


            /* -------------------------------------------------
               FORM VALUES
               IMPORTANT:
               Read resource URLs HERE,
               not globally.
               ------------------------------------------------- */

            const title =
                document
                    .getElementById(
                        "taskTitle"
                    )
                    ?.value
                    .trim() || "";


            const description =
                document
                    .getElementById(
                        "taskDescription"
                    )
                    ?.value
                    .trim() || "";


            const dueDate =
                document
                    .getElementById(
                        "dueDate"
                    )
                    ?.value || "";


            const canvaUrl =
                document
                    .getElementById(
                        "taskCanvaUrl"
                    )
                    ?.value
                    .trim() || "";


            const assetsFolderUrl =
                document
                    .getElementById(
                        "taskAssetsFolderUrl"
                    )
                    ?.value
                    .trim() || "";


            const referenceUrl =
                document
                    .getElementById(
                        "taskReferenceUrl"
                    )
                    ?.value
                    .trim() || "";


            if (!title) {

                alert(
                    "Please enter a task title."
                );

                return;
            }


            /* -------------------------------------------------
               SUBMIT BUTTON
               ------------------------------------------------- */

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
                        }
                    );


                /* -------------------------------------------------
                   RESET FORM
                   ------------------------------------------------- */

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


                /* -------------------------------------------------
                   REFRESH
                   ------------------------------------------------- */

                await loadTasks();


                if (
                    me?.role ===
                    "head"
                ) {
                    await loadAudit();
                }


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


/* =========================================================
   MEMBER CREATION
   ========================================================= */

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


/* =========================================================
   LOGOUT
   ========================================================= */

document
    .getElementById(
        "logoutBtn"
    )
    ?.addEventListener(
        "click",
        async () => {

            const button =
                document.getElementById(
                    "logoutBtn"
                );


            if (button) {
                button.disabled =
                    true;
            }


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

                /*
                   Always leave dashboard,
                   even if API request fails.
                */

                window.location.replace(
                    "/"
                );
            }
        }
    );


/* =========================================================
   AUDIT LOGS
   ========================================================= */

async function loadAudit() {

    try {

        const data =
            await api(
                "/api/audit"
            );


        renderAudit(
            Array.isArray(data)
                ? data
                : []
        );

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
                    ${escapeHtml(user)}
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


        container.appendChild(item);
    });
}


/* =========================================================
   CUSTOM DATE PICKER ELEMENTS
   ========================================================= */

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


/* =========================================================
   DATE PICKER OPEN / CLOSE
   ========================================================= */

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


/* =========================================================
   PREVIOUS MONTH
   ========================================================= */

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


/* =========================================================
   NEXT MONTH
   ========================================================= */

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


/* =========================================================
   TODAY
   ========================================================= */

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


            datePicker
                ?.classList.add(
                    "hidden"
                );


            datePickerButton
                ?.classList.remove(
                    "active"
                );


            renderDatePicker();
        }
    );


/* =========================================================
   CLEAR DATE
   ========================================================= */

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


/* =========================================================
   CLOSE DATE PICKER OUTSIDE
   ========================================================= */

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


/* =========================================================
   RENDER DATE PICKER
   ========================================================= */

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


    /* -----------------------------------------------------
       PREVIOUS MONTH DAYS
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       CURRENT MONTH
       ----------------------------------------------------- */

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


        /* TODAY */

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


        /* SELECTED DATE */

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


                datePicker
                    ?.classList.add(
                        "hidden"
                    );


                datePickerButton
                    ?.classList.remove(
                        "active"
                    );
            }
        );


        dateGrid.appendChild(day);
    }


    /* -----------------------------------------------------
       NEXT MONTH PADDING
       ----------------------------------------------------- */

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


/* =========================================================
   SET SELECTED DATE
   ========================================================= */

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


/* =========================================================
   START APPLICATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        init();
    }
);
