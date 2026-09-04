let me=null;
async function api(url,options={}){const r=await fetch(url,options);const d=await r.json();if(!r.ok)throw Error(d.error||"Request failed");return d}
function escapeHtml(s=""){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function init(){try{me=await api("/api/me")}catch{location.href="/";return}
userName.textContent=me.name;roleBadge.textContent=me.role==="head"?"HEAD":(me.team_member_id||"MEMBER");
const res=await api("/api/resources");waCard.href=res.whatsapp||"#";canvaCard.href=res.canva||"#";folderCard.href=res.folder||"#";
if(me.role==="head"){headPanel.classList.remove("hidden");headManagement.classList.remove("hidden");auditPanel.classList.remove("hidden");await loadMembers();await loadAudit()}await loadTasks()}
async function loadTasks(){const data=await api("/api/tasks");taskCount.textContent=data.length;taskList.innerHTML=data.length?data.map(t=>`<article class="task"><div><h3>${escapeHtml(t.title)}</h3><p>${escapeHtml(t.description||"")}</p><small>${escapeHtml(t.assigned_name||"")} ${t.due_date?"· Due "+escapeHtml(t.due_date):""}</small></div><select data-task="${t.id}" class="status-select">${["Assigned","In Progress","Completed"].map(s=>`<option ${t.status===s?"selected":""}>${s}</option>`).join("")}</select></article>`).join(""):`<div class="empty">No tasks available.</div>`;
document.querySelectorAll(".status-select").forEach(s=>s.addEventListener("change",async()=>{await api("/api/tasks/"+s.dataset.task,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:s.value})})}))}
async function loadMembers(){const data=await api("/api/members");assignee.innerHTML=data.filter(x=>x.active).map(x=>`<option value="${x.id}">${escapeHtml(x.team_member_id)} — ${escapeHtml(x.name)}</option>`).join("");memberList.innerHTML=data.map(x=>`<div class="member-row"><div><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.team_member_id)} · ${escapeHtml(x.email)} · ${escapeHtml(x.phone)}</span></div><button class="ghost-btn" onclick="toggleMember('${x.id}',${!x.active})">${x.active?"Disable":"Enable"}</button></div>`).join("")}
async function toggleMember(id,active){await api("/api/members/"+id+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active})});await loadMembers()}
// Function to render audit logs with formatted date/time
function renderAuditLogs(logs) {
  const auditList = document.getElementById('auditList');
  auditList.innerHTML = logs.map(log => {
    // Converts Unix timestamp or binary-encoded date string to Date object
    const dateObj = new Date(typeof log.timestamp === 'string' && log.timestamp.startsWith('0b') 
      ? parseInt(log.timestamp.slice(2), 2) 
      : log.timestamp);

    const formattedTime = dateObj.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium'
    });

    return `
      <tr>
        <td><strong>${log.userName}</strong></td>
        <td>${log.action}</td>
        <td><code>${log.ip}</code></td>
        <td class="timestamp">${formattedTime}</td>
        <td><span class="badge ${log.status === 'Success' ? 'success' : 'danger'}">${log.status}</span></td>
      </tr>
    `;
  }).join('');
}
taskForm.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:taskTitle.value,description:taskDescription.value,assigned_to:assignee.value,due_date:dueDate.value})});e.target.reset();await loadTasks();alert("Task assigned.")}catch(err){alert(err.message)}})
memberFormAdmin.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/members",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:newName.value,email:newEmail.value,phone:newPhone.value,team_member_id:newMemberId.value})});e.target.reset();await loadMembers()}catch(err){alert(err.message)}})
logoutBtn.addEventListener("click",async()=>{await api("/api/logout",{method:"POST"});location.href="/"});init();
