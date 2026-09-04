// DOM Element Selectors
const tabs = document.querySelectorAll(".tab");
const headForm = document.querySelector("#headForm");
const memberForm = document.querySelector("#memberForm");
const msg = document.querySelector("#loginMessage");

// 1. Tab Switching Functionality
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    // Remove active class from all tabs and activate the clicked one
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    // Check if the selected tab is for "head" login
    const isHeadTab = tab.dataset.tab === "head";

    // Toggle form visibility based on selected tab
    headForm.classList.toggle("hidden", !isHeadTab);
    memberForm.classList.toggle("hidden", isHeadTab);

    // Clear any existing error or status messages
    msg.textContent = "";
  });
});

// 2. Helper function to send POST requests
async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Login failed");
  }

  return data;
}

// 3. Head Login Form Submission
headForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    await post("/api/login/head", {
      identifier: headIdentifier.value,
      password: headPassword.value,
      mpin: headMpin.value,
    });
    // Redirect to dashboard on successful login
    location.href = "/dashboard";
  } catch (err) {
    msg.textContent = err.message;
  }
});

// 4. Member Login Form Submission
memberForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    await post("/api/login/member", {
      email: memberEmail.value,
      phone: memberPhone.value,
      team_member_id: memberId.value,
    });
    // Redirect to dashboard on successful login
    location.href = "/dashboard";
  } catch (err) {
    msg.textContent = err.message;
  }
});
