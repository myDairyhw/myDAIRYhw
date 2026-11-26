(() => {
  "use strict";

  const DAYS = [
    { name: "ראשון", short: "א׳" },
    { name: "שני", short: "ב׳" },
    { name: "שלישי", short: "ג׳" },
    { name: "רביעי", short: "ד׳" },
    { name: "חמישי", short: "ה׳" },
    { name: "שישי", short: "ו׳" },
    { name: "שבת", short: "ש׳" },
  ];
  const STORAGE_KEY = "shav-demo-v1";
  const config = window.APP_CONFIG || {};
  const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const supabase = hasSupabaseConfig && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    welcome: $("#welcome-view"),
    dashboard: $("#dashboard-view"),
    authDialog: $("#auth-dialog"),
    taskDialog: $("#task-dialog"),
    scheduleDialog: $("#schedule-dialog"),
    authForm: $("#auth-form"),
    taskForm: $("#task-form"),
    scheduleForm: $("#schedule-form"),
    weekGrid: $("#week-grid"),
    emptySchedule: $("#empty-schedule"),
    tasksList: $("#tasks-list"),
    emptyTasks: $("#empty-tasks"),
    loginButton: $("#login-button"),
    signupButton: $("#signup-button"),
    demoButton: $("#demo-button"),
    signoutButton: $("#signout-button"),
    settingsButton: $("#settings-button"),
    authTitle: $("#auth-title"),
    authSubtitle: $("#auth-subtitle"),
    authSubmit: $("#auth-submit"),
    authSwitch: $("#auth-switch"),
    authError: $("#auth-error"),
    taskError: $("#task-error"),
    scheduleError: $("#schedule-error"),
    nameField: $("#name-field"),
    reminderStatus: $("#reminder-status"),
    modeBadge: $("#mode-badge"),
    toast: $("#toast"),
  };

  let state = loadDemoState();
  let user = null;
  let isDemo = !supabase;
  let demoStarted = false;
  let authMode = "signup";
  let toastTimer;
  const focusDuration = 25 * 60;
  let focusSecondsRemaining = focusDuration;
  let focusInterval = null;

  function loadDemoState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.tasks) && saved.preferences) {
        return {
          ...saved,
          studyField: saved.studyField || "לימודים כלליים",
          courses: Array.isArray(saved.courses) ? saved.courses : [],
          scheduleSetupComplete: Boolean(saved.scheduleSetupComplete),
          tasks: saved.tasks.map((task) => ({
            ...task,
            category: task.category || "assignment",
            dueDate: task.dueDate || "",
          })),
          preferences: {
            remindToday: true,
            remindTomorrow: false,
            remindTodayAt: saved.preferences.reminderTime || "08:00",
            remindTomorrowAt: saved.preferences.reminderTime || "20:00",
            ...saved.preferences,
          },
        };
      }
    } catch (error) {
      console.warn("Could not read saved demo data.", error);
    }
    return {
      name: "",
      studyField: "לימודים כלליים",
      email: "",
      tasks: [],
      courses: [],
      scheduleSetupComplete: false,
      preferences: { remindToday: true, remindTomorrow: false, remindTodayAt: "08:00", remindTomorrowAt: "20:00" },
    };
  }

  function saveDemoState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
  }

  function showView() {
    const loggedIn = (isDemo && demoStarted) || Boolean(user);
    elements.welcome.hidden = loggedIn;
    elements.dashboard.hidden = !loggedIn;
    elements.loginButton.hidden = loggedIn;
    elements.signupButton.hidden = loggedIn;
    elements.signoutButton.hidden = !loggedIn;
    elements.settingsButton.hidden = !loggedIn;
    elements.modeBadge.hidden = !loggedIn;
    elements.modeBadge.textContent = isDemo ? "מצב הדגמה — נשמר בדפדפן" : "מחובר לחשבון";
    if (loggedIn) renderDashboard();
  }

  function renderDashboard() {
    const displayName = state.name ? `, ${escapeHtml(state.name)}` : "";
    $("#greeting").innerHTML = `היי${displayName}, איזה כיף שאת כאן <span>✦</span>`;
    $("#study-field-label").textContent = `הלימודים שלך: ${state.studyField || "לימודים כלליים"}`;
    $("#study-field-description").textContent = `המרחב שלך ל${state.studyField || "לימודים כלליים"} — בקצב שלך, בדרך שלך.`;
    $("#account-email").textContent = state.email || "הגדרת התזכורות האישיות שלך";
    $("#remind-today").checked = Boolean(state.preferences.remindToday);
    $("#remind-tomorrow").checked = Boolean(state.preferences.remindTomorrow);
    $("#remind-today-at").value = state.preferences.remindTodayAt || "08:00";
    $("#remind-tomorrow-at").value = state.preferences.remindTomorrowAt || "20:00";
    $("#scheduled-count").textContent = String(state.tasks.length);
    $("#planned-days-count").textContent = `${new Set(state.courses.map((course) => course.day)).size}/7`;
    renderWeek();
    renderTasks();
    renderFocusTimer();
  }

  function renderWeek() {
    const today = new Date().getDay();
    const coursesByDay = DAYS.map((_, day) => state.courses.filter((course) => course.day === day));
    elements.weekGrid.innerHTML = DAYS.map((day, index) => {
      const courses = coursesByDay[index].slice().sort((first, second) => first.start.localeCompare(second.start));
      const todayDate = new Date();
      const dateNumber = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + index - today).getDate();
      return `<article class="day-column ${index === today ? "is-today" : ""}">
        <div class="day-heading"><span>${day.name}</span><strong>${dateNumber}</strong></div>
        <div class="day-tasks">${courses.length ? courses.map((course) => `
          <div class="course-chip">
            <strong>${escapeHtml(course.name)}</strong>
            <small>${escapeHtml(course.start)} – ${escapeHtml(course.end)}</small>
          </div>`).join("") : '<span class="empty-day">יום פנוי</span>'}
        </div>
      </article>`;
    }).join("");
    elements.emptySchedule.hidden = state.courses.length > 0;
    elements.weekGrid.hidden = state.courses.length === 0;
  }

  function renderTasks() {
    const categoryLabels = { assignment: "הגשה", project: "פרויקט", exam: "מבחן", practice: "תרגול" };
    const tasks = state.tasks.slice().sort((first, second) =>
      (first.dueDate || "9999-12-31").localeCompare(second.dueDate || "9999-12-31")
      || (first.time || "99:99").localeCompare(second.time || "99:99"));
    elements.tasksList.innerHTML = tasks.map((task) => `
      <article class="deadline-card">
        <span class="deadline-icon ${escapeHtml(task.category || "assignment")}">${categoryIcon(task.category)}</span>
        <div class="deadline-copy">
          <span class="deadline-type">${escapeHtml(categoryLabels[task.category] || "מטלה")}</span>
          <strong>${escapeHtml(task.title)}</strong>
          ${task.notes ? `<small>${escapeHtml(task.notes)}</small>` : ""}
        </div>
        <div class="deadline-date"><strong>${task.dueDate ? escapeHtml(formatDate(task.dueDate)) : "ללא מועד"}</strong>${task.time ? `<small>${escapeHtml(task.time)}</small>` : ""}</div>
        <button class="delete-task" type="button" data-delete="${escapeHtml(task.id)}" aria-label="מחיקת ${escapeHtml(task.title)}" title="מחיקה">×</button>
      </article>`).join("");
    elements.emptyTasks.hidden = tasks.length > 0;
    elements.tasksList.hidden = tasks.length === 0;
    $("#scheduled-count").textContent = String(state.tasks.length + state.courses.length);
  }

  function categoryIcon(category) {
    return ({ assignment: "↗", project: "⌘", exam: "✦", practice: "⌁" })[category] || "↗";
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" })
      .format(new Date(`${value}T12:00:00`));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  async function loadCloudData() {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name,study_field,email,timezone,remind_today_at,remind_tomorrow_at,remind_today,remind_tomorrow,schedule_setup_completed")
      .eq("user_id", user.id)
      .single();
    if (profileError) throw profileError;
    const [taskResult, courseResult] = await Promise.all([
      supabase
      .from("tasks")
      .select("id,title,category,notes,due_date,task_time,weekday")
      .eq("user_id", user.id)
      .order("due_date"),
      supabase
        .from("course_sessions")
        .select("id,course_name,weekday,starts_at,ends_at")
        .eq("user_id", user.id)
        .order("weekday")
        .order("starts_at"),
    ]);
    if (taskResult.error) throw taskResult.error;
    if (courseResult.error) throw courseResult.error;
    state = {
      name: profile.display_name || "",
      studyField: profile.study_field || "לימודים כלליים",
      email: profile.email || user.email || "",
      scheduleSetupComplete: Boolean(profile.schedule_setup_completed),
      preferences: {
        remindToday: profile.remind_today,
        remindTomorrow: profile.remind_tomorrow,
        remindTodayAt: String(profile.remind_today_at || "08:00").slice(0, 5),
        remindTomorrowAt: String(profile.remind_tomorrow_at || "20:00").slice(0, 5),
      },
      tasks: taskResult.data.map((task) => ({
        id: task.id,
        title: task.title,
        category: task.category || "assignment",
        notes: task.notes || "",
        dueDate: task.due_date,
        time: task.task_time ? String(task.task_time).slice(0, 5) : "",
        day: task.weekday,
      })),
      courses: courseResult.data.map((course) => ({
        id: course.id,
        name: course.course_name,
        day: course.weekday,
        start: String(course.starts_at).slice(0, 5),
        end: String(course.ends_at).slice(0, 5),
      })),
    };
    showView();
    if (!state.scheduleSetupComplete) openScheduleDialog();
  }

  async function startCloudSession(session) {
    user = session ? session.user : null;
    if (!user) {
      isDemo = false;
      state = loadDemoState();
      showView();
      return;
    }
    isDemo = false;
    try {
      await loadCloudData();
    } catch (error) {
      console.error("Could not load the user's Supabase data.", error);
      state = {
        name: "",
        studyField: "לימודים כלליים",
        email: user.email || "",
        tasks: [],
        courses: [],
        scheduleSetupComplete: false,
        preferences: {
          remindToday: true,
          remindTomorrow: false,
          remindTodayAt: "08:00",
          remindTomorrowAt: "20:00",
        },
      };
      showToast("לא הצלחנו לטעון את הלוח. בדקי את חיבור Supabase והרשאות הטבלאות.");
      showView();
    }
  }

  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === "signup";
    elements.authTitle.textContent = signup ? "פותחות חשבון" : "טוב שחזרת";
    elements.authSubtitle.textContent = signup ? "כמה פרטים קטנים, והלוח האישי שלך מוכן." : "התחברי כדי לפתוח את הלוח האישי שלך.";
    elements.authSubmit.textContent = signup ? "יצירת חשבון" : "כניסה";
    elements.nameField.hidden = !signup;
    $("#study-field-input-label").hidden = !signup;
    $("#auth-config-note").hidden = !isDemo;
    $("#auth-name").required = signup;
    $("#auth-study-field").required = signup;
    $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
    elements.authSwitch.textContent = signup ? "כבר יש לך חשבון? כניסה" : "חדשה כאן? יצירת חשבון";
    elements.authError.textContent = "";
  }

  function openAuth(mode) {
    setAuthMode(mode);
    elements.authDialog.showModal();
  }

  function openTaskDialog(title = "") {
    $("#task-title").value = title;
    $("#task-notes").value = "";
    $("#task-time").value = "";
    $("#task-category").value = "assignment";
    $("#task-due-date").min = dateInputValue();
    $("#task-due-date").value = dateInputValue();
    elements.taskError.textContent = "";
    elements.taskDialog.showModal();
    $("#task-title").focus();
  }

  function dateInputValue(date = new Date()) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  }

  function addCourseRow(course = {}) {
    const row = document.createElement("div");
    row.className = "course-editor-row";
    row.dataset.sessionId = course.id || "";
    row.innerHTML = `
      <select aria-label="יום בשבוע" data-course-day>${DAYS.map((day, index) => `<option value="${index}" ${Number(course.day) === index ? "selected" : ""}>${day.name}</option>`).join("")}</select>
      <input type="text" maxlength="80" aria-label="שם השיעור או המפגש" data-course-name placeholder="למשל: שיעור מבוא" value="${escapeHtml(course.name || "")}" />
      <input type="time" aria-label="שעת התחלה" data-course-start value="${escapeHtml(course.start || "")}" />
      <input type="time" aria-label="שעת סיום" data-course-end value="${escapeHtml(course.end || "")}" />
      <button class="remove-course-row" type="button" data-remove-course aria-label="הסרת שיעור">×</button>`;
    $("#course-rows").append(row);
  }

  function openScheduleDialog() {
    if (elements.scheduleDialog.open) return;
    $("#course-rows").innerHTML = "";
    elements.scheduleError.textContent = "";
    if (state.courses.length) {
      state.courses.forEach(addCourseRow);
    } else {
      addCourseRow();
    }
    elements.scheduleDialog.showModal();
  }

  async function saveSchedule(event) {
    event.preventDefault();
    const rows = Array.from($("#course-rows").querySelectorAll(".course-editor-row"));
    const courses = [];
    for (const row of rows) {
      const name = row.querySelector("[data-course-name]").value.trim();
      const start = row.querySelector("[data-course-start]").value;
      const end = row.querySelector("[data-course-end]").value;
      const day = Number(row.querySelector("[data-course-day]").value);
      if (!name && !start && !end) continue;
      if (!name || !start || !end) {
        elements.scheduleError.textContent = "לכל שיעור צריך למלא שם קורס, שעת התחלה ושעת סיום.";
        return;
      }
      if (start >= end) {
        elements.scheduleError.textContent = "שעת הסיום צריכה להיות מאוחרת משעת ההתחלה.";
        return;
      }
      courses.push({
        id: row.dataset.sessionId || crypto.randomUUID(),
        name,
        day,
        start,
        end,
      });
    }

    $("#schedule-submit").disabled = true;
    elements.scheduleError.textContent = "";
    try {
      if (!isDemo) {
        if (courses.length) {
          const { error } = await supabase.from("course_sessions").upsert(courses.map((course) => ({
            id: course.id,
            user_id: user.id,
            course_name: course.name,
            weekday: course.day,
            starts_at: course.start,
            ends_at: course.end,
          })));
          if (error) throw error;
        }
        for (const oldCourse of state.courses) {
          if (!courses.some((course) => course.id === oldCourse.id)) {
            const { error } = await supabase.from("course_sessions")
              .delete().eq("id", oldCourse.id).eq("user_id", user.id);
            if (error) throw error;
          }
        }
        const { error: profileError } = await supabase.from("profiles")
          .update({ schedule_setup_completed: true }).eq("user_id", user.id);
        if (profileError) throw profileError;
      }
      state.courses = courses;
      state.scheduleSetupComplete = true;
      if (isDemo) saveDemoState();
      elements.scheduleDialog.close();
      renderDashboard();
      showToast("מערכת הקורסים שלך נשמרה.");
    } catch (error) {
      console.error("Could not save the course schedule.", error);
      elements.scheduleError.textContent = "לא הצלחנו לשמור את המערכת. בדקי את חיבור Supabase ונסי שוב.";
    } finally {
      $("#schedule-submit").disabled = false;
    }
  }

  function skipScheduleSetup() {
    elements.scheduleDialog.close();
    showToast("אפשר להגדיר או לערוך את מערכת הקורסים בכל שלב.");
  }

  async function createAccount(email, password, name, studyField) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name, study_field: studyField } },
    });
    if (error) throw error;
    if (data.session) {
      user = data.session.user;
      const { error: profileError } = await supabase.from("profiles").upsert({
        user_id: user.id,
        email,
        display_name: name,
        study_field: studyField,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem",
      });
      if (profileError) throw profileError;
      await loadCloudData();
      elements.authDialog.close();
      showToast("ברוכה הבאה! החשבון שלך מוכן.");
    } else {
      elements.authDialog.close();
      showToast("שלחנו לך מייל לאימות החשבון. אשרי אותו ואז התחברי.");
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    elements.authError.textContent = "";
    const email = $("#auth-email").value.trim();
    const password = $("#auth-password").value;
    const name = $("#auth-name").value.trim();
    const studyField = $("#auth-study-field").value.trim();
    if (authMode === "signup" && !studyField) {
      elements.authError.textContent = "כתבי את תחום הלימודים שלך כדי שנוכל להתאים לך את המרחב.";
      return;
    }
    elements.authSubmit.disabled = true;
    try {
      if (isDemo) {
        state.name = authMode === "signup" ? name : state.name;
        state.studyField = authMode === "signup" ? studyField : state.studyField || "לימודים כלליים";
        state.email = email;
        demoStarted = true;
        saveDemoState();
        elements.authDialog.close();
        showView();
        showToast("התחברת למצב הדגמה. המידע נשמר בדפדפן הזה בלבד.");
        return;
      }
      if (authMode === "signup") {
        await createAccount(email, password, name, studyField);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        user = data.user;
        await loadCloudData();
        elements.authDialog.close();
        showToast("התחברת בהצלחה.");
      }
    } catch (error) {
      console.error("Authentication failed.", error);
      elements.authError.textContent = authErrorMessage(error);
    } finally {
      elements.authSubmit.disabled = false;
    }
  }

  function authErrorMessage(error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("already registered") || message.includes("already been registered")) return "כתובת המייל כבר רשומה. נסי להתחבר.";
    if (message.includes("invalid login credentials")) return "המייל או הסיסמה לא נכונים.";
    if (message.includes("password")) return "הסיסמה צריכה להכיל לפחות 6 תווים.";
    if (message.includes("fetch")) return "לא הצלחנו להתחבר לשרת. בדקי את הגדרות Supabase ואת החיבור לאינטרנט.";
    return error.message || "משהו השתבש. נסי שוב.";
  }

  async function addTask(event) {
    event.preventDefault();
    const title = $("#task-title").value.trim();
    const notes = $("#task-notes").value.trim();
    const time = $("#task-time").value;
    const category = $("#task-category").value;
    const dueDate = $("#task-due-date").value;
    const day = new Date(`${dueDate}T12:00:00`).getDay();
    $("#task-submit").disabled = true;
    elements.taskError.textContent = "";
    try {
      if (!isDemo) {
        const { data, error } = await supabase.from("tasks").insert({
          user_id: user.id,
          title,
          category,
          notes,
          due_date: dueDate,
          task_time: time || null,
          weekday: day,
        }).select("id,title,category,notes,due_date,weekday,task_time").single();
        if (error) throw error;
        state.tasks.push({
          id: data.id,
          title: data.title,
          category: data.category,
          notes: data.notes || "",
          dueDate: data.due_date,
          time: data.task_time ? String(data.task_time).slice(0, 5) : "",
          day: data.weekday,
        });
      } else {
        state.tasks.push({ id: crypto.randomUUID(), title, category, notes, dueDate, time, day });
        saveDemoState();
      }
      elements.taskDialog.close();
      renderDashboard();
      showToast("המטלה נוספה לרשימה.");
    } catch (error) {
      console.error("Could not add deadline task.", error);
      elements.taskError.textContent = "לא הצלחנו לשמור את המטלה. בדקי את החיבור ונסי שוב.";
    } finally {
      $("#task-submit").disabled = false;
    }
  }

  async function deleteTask(id) {
    try {
      if (!isDemo) {
        const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", user.id);
        if (error) throw error;
      }
      state.tasks = state.tasks.filter((task) => task.id !== id);
      if (isDemo) saveDemoState();
      renderDashboard();
      showToast("המטלה הוסרה מהרשימה.");
    } catch (error) {
      console.error("Could not delete task.", error);
      showToast("לא הצלחנו למחוק את המשימה. נסי שוב.");
    }
  }

  async function savePreferences() {
    const previous = { ...state.preferences };
    const updated = {
      remindToday: $("#remind-today").checked,
      remindTomorrow: $("#remind-tomorrow").checked,
      remindTodayAt: $("#remind-today-at").value || "08:00",
      remindTomorrowAt: $("#remind-tomorrow-at").value || "20:00",
    };
    state.preferences = updated;
    elements.reminderStatus.textContent = isDemo ? "נשמר במצב הדגמה בדפדפן הזה." : "שומר…";
    try {
      if (!isDemo) {
        const { error } = await supabase.from("profiles").update({
          remind_today: updated.remindToday,
          remind_tomorrow: updated.remindTomorrow,
          remind_today_at: updated.remindTodayAt,
          remind_tomorrow_at: updated.remindTomorrowAt,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem",
        }).eq("user_id", user.id);
        if (error) throw error;
      } else {
        saveDemoState();
      }
      elements.reminderStatus.textContent = isDemo ? "נשמר במצב הדגמה בדפדפן הזה." : "נשמר. התזכורת תישלח בשעה שבחרת.";
    } catch (error) {
      console.error("Could not save reminder preferences.", error);
      state.preferences = previous;
      $("#remind-today").checked = previous.remindToday;
      $("#remind-tomorrow").checked = previous.remindTomorrow;
      $("#remind-today-at").value = previous.remindTodayAt;
      $("#remind-tomorrow-at").value = previous.remindTomorrowAt;
      elements.reminderStatus.textContent = "לא הצלחנו לשמור. בדקי חיבור ונסי שוב.";
    }
  }

  async function signOut() {
    if (isDemo) {
      isDemo = false;
      demoStarted = false;
      state = loadDemoState();
      showView();
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Could not sign out.", error);
      showToast("לא הצלחנו להתנתק. נסי שוב.");
    }
  }

  function renderFocusTimer() {
    const minutes = Math.floor(focusSecondsRemaining / 60).toString().padStart(2, "0");
    const seconds = (focusSecondsRemaining % 60).toString().padStart(2, "0");
    $("#focus-display").textContent = `${minutes}:${seconds}`;
    $("#focus-progress").style.width = `${((focusDuration - focusSecondsRemaining) / focusDuration) * 100}%`;
    $("#focus-toggle").innerHTML = focusInterval
      ? 'השהי רגע <span>Ⅱ</span>'
      : focusSecondsRemaining < focusDuration && focusSecondsRemaining > 0
        ? 'המשיכי פוקוס <span>→</span>'
        : 'מתחילות פוקוס <span>→</span>';
  }

  function toggleFocusTimer() {
    if (focusInterval) {
      clearInterval(focusInterval);
      focusInterval = null;
      renderFocusTimer();
      showToast("הטיימר הושהה. קחי את הזמן שלך.");
      return;
    }

    if (focusSecondsRemaining === 0) focusSecondsRemaining = focusDuration;
    focusInterval = setInterval(() => {
      focusSecondsRemaining -= 1;
      if (focusSecondsRemaining <= 0) {
        focusSecondsRemaining = 0;
        clearInterval(focusInterval);
        focusInterval = null;
        renderFocusTimer();
        showToast("סשן הפוקוס הסתיים — כל הכבוד על ההתמדה!");
        return;
      }
      renderFocusTimer();
    }, 1000);
    renderFocusTimer();
    showToast("סשן הפוקוס התחיל. את לגמרי יכולה לעשות את זה.");
  }

  function resetFocusTimer() {
    clearInterval(focusInterval);
    focusInterval = null;
    focusSecondsRemaining = focusDuration;
    renderFocusTimer();
  }

  function showDashboardFromDemo() {
    isDemo = true;
    demoStarted = true;
    state = loadDemoState();
    if (!state.tasks.length) {
      state.tasks = [
        { id: crypto.randomUUID(), title: "להגיש את המטלה השבועית", category: "assignment", notes: "לחלק את העבודה לצעדים קטנים", dueDate: dateForWeekday(2), time: "17:00" },
        { id: crypto.randomUUID(), title: "להתקדם בפרויקט", category: "project", notes: "גם צעד קטן נחשב", dueDate: dateForWeekday(5), time: "" },
      ];
    }
    if (!state.courses.length) {
      state.courses = [
        { id: crypto.randomUUID(), name: "שיעור ראשון", day: 0, start: "09:00", end: "10:30" },
        { id: crypto.randomUUID(), name: "שיעור שני", day: 2, start: "11:00", end: "12:30" },
        { id: crypto.randomUUID(), name: "תרגול", day: 2, start: "13:00", end: "14:30" },
        { id: crypto.randomUUID(), name: "שיעור נוסף", day: 4, start: "10:00", end: "11:30" },
      ];
    }
    saveDemoState();
    showView();
    if (!state.scheduleSetupComplete) openScheduleDialog();
    showToast("את צופה במצב הדגמה. אפשר להגדיר מערכת, לנהל מטלות ולנסות את כלי הלמידה.");
  }

  function dateForWeekday(weekday) {
    const date = new Date();
    date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
    return dateInputValue(date);
  }

  function bindEvents() {
    elements.loginButton.addEventListener("click", () => openAuth("login"));
    elements.signupButton.addEventListener("click", () => openAuth("signup"));
    elements.demoButton.addEventListener("click", showDashboardFromDemo);
    elements.signoutButton.addEventListener("click", signOut);
    elements.settingsButton.addEventListener("click", () => $("#remind-today-at").focus());
    elements.authSwitch.addEventListener("click", () => setAuthMode(authMode === "signup" ? "login" : "signup"));
    elements.authForm.addEventListener("submit", submitAuth);
    elements.taskForm.addEventListener("submit", addTask);
    elements.scheduleForm.addEventListener("submit", saveSchedule);
    $("#add-course-row").addEventListener("click", () => addCourseRow());
    $("#skip-schedule").addEventListener("click", skipScheduleSetup);
    $("#edit-schedule-button").addEventListener("click", openScheduleDialog);
    $("#add-task-button").addEventListener("click", openTaskDialog);
    $("#tasks-add-task-button").addEventListener("click", openTaskDialog);
    $("#hero-add-task").addEventListener("click", openTaskDialog);
    elements.emptySchedule.addEventListener("click", openScheduleDialog);
    elements.emptyTasks.addEventListener("click", openTaskDialog);
    $("#challenge-task-button").addEventListener("click", () => openTaskDialog("לתרגל ולחזור על נושא מהשיעור"));
    $("#reveal-challenge").addEventListener("click", (event) => {
      const answer = $("#challenge-answer");
      answer.hidden = !answer.hidden;
      event.currentTarget.setAttribute("aria-expanded", String(!answer.hidden));
      event.currentTarget.innerHTML = answer.hidden ? 'גלי את הפתרון <span>↙</span>' : 'הסתירי את הפתרון <span>↗</span>';
    });
    $("#focus-toggle").addEventListener("click", toggleFocusTimer);
    $("#focus-reset").addEventListener("click", resetFocusTimer);
    elements.tasksList.addEventListener("click", (event) => {
      const deleteButton = event.target.closest("[data-delete]");
      if (deleteButton) deleteTask(deleteButton.dataset.delete);
    });
    $("#course-rows").addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-course]");
      if (removeButton) removeButton.closest(".course-editor-row").remove();
    });
    $("#remind-today").addEventListener("change", savePreferences);
    $("#remind-tomorrow").addEventListener("change", savePreferences);
    $("#remind-today-at").addEventListener("change", savePreferences);
    $("#remind-tomorrow-at").addEventListener("change", savePreferences);
    for (const dialog of [elements.authDialog, elements.taskDialog, elements.scheduleDialog]) {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
  }

  bindEvents();
  if (supabase) {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Could not restore the Supabase session.", error);
        showToast("לא הצלחנו לבדוק את מצב ההתחברות.");
        showView();
        return;
      }
      return startCloudSession(data.session);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      startCloudSession(session);
    });
  } else {
    showView();
  }
})();
