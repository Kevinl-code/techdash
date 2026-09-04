function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const member = data.member;
  const task = data.task;

  if (!member || !task) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:"Invalid payload"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  MailApp.sendEmail({
    to: member.email,
    subject: "New technical team task: " + task.title,
    body:
      "Hello " + member.name + ",\n\n" +
      "A new task has been assigned to you.\n\n" +
      "Task: " + task.title + "\n" +
      "Description: " + (task.description || "") + "\n" +
      "Due: " + (task.due_date || "Not specified")
  });

  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}
