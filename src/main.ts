// ============================================================
//  TASKFLOW — main.ts
//  Clean, modular TypeScript. No external libraries needed.
//  Compatible with Vite (run: vite dev)
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface Task {
  id: string;           // unique identifier
  text: string;         // task content
  completed: boolean;   // done or not
  createdAt: number;    // Unix timestamp (ms)
  updatedAt: number;    // last edit timestamp (ms)
}

// All users' tasks stored together: { "john": Task[], "alex": Task[] }
type AllTasks = Record<string, Task[]>;

type Filter = "all" | "active" | "completed";

// ── State ────────────────────────────────────────────────────

let currentUser: string = "";
let tasks: Task[] = [];
let currentFilter: Filter = "all";
let checkedIds: Set<string> = new Set();

// ── LocalStorage keys ────────────────────────────────────────

const STORAGE_KEY_TASKS = "taskflow_tasks";
const STORAGE_KEY_USER  = "taskflow_current_user";

// ── Storage helpers ───────────────────────────────────────────

function loadAllTasks(): AllTasks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TASKS);
    return raw ? (JSON.parse(raw) as AllTasks) : {};
  } catch {
    return {};
  }
}

function saveAllTasks(all: AllTasks): void {
  localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(all));
}

function loadUserTasks(username: string): Task[] {
  const all = loadAllTasks();
  return all[username] ?? [];
}

function saveUserTasks(username: string, userTasks: Task[]): void {
  const all = loadAllTasks();
  all[username] = userTasks;
  saveAllTasks(all);
}

// ── Unique ID generator ───────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Toast notifications ───────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string, type: "success" | "error" | "info" = "info"): void {
  const toast = document.getElementById("toast")!;
  // Remove old type classes
  toast.className = "toast";
  toast.classList.add(`toast--${type}`);
  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

// ── Time-ago formatter ────────────────────────────────────────

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);

  if (seconds < 5)  return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24)   return `${hours}h ago`;
  if (days < 7)     return `${days}d ago`;

  // Older than 7 days → show date
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: days > 365 ? "numeric" : undefined,
  });
}

// ── Confirm dialog ─────────────────────────────────────────────

function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmOverlay")!;
    const msgEl   = document.getElementById("confirmMessage")!;
    const okBtn   = document.getElementById("confirmOk")!;
    const cancelBtn = document.getElementById("confirmCancel")!;

    msgEl.textContent = message;
    overlay.classList.remove("hidden");

    function cleanup(result: boolean) {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }

    function onOk()     { cleanup(true);  }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);

    // Click outside box also cancels
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    }, { once: true });
  });
}

// ── Stats bar ───────────────────────────────────────────────

function updateStats(): void {
  const total     = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const active    = total - completed;

  document.getElementById("statTotal")!.textContent  = String(total);
  document.getElementById("statActive")!.textContent = String(active);
  document.getElementById("statDone")!.textContent   = String(completed);
}

// ── Filter tasks ────────────────────────────────────────────

function getFilteredTasks(): Task[] {
  switch (currentFilter) {
    case "active":    return tasks.filter((t) => !t.completed);
    case "completed": return tasks.filter((t) =>  t.completed);
    default:          return tasks;
  }
}

// ── Build task element ──────────────────────────────────────

function createTaskElement(task: Task): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `task-item${task.completed ? " completed" : ""}`;
  li.dataset.id = task.id;

  // Timestamp label
  const wasEdited = task.updatedAt > task.createdAt + 2000; // >2s difference = edited
  const metaText  = wasEdited
    ? `Edited ${timeAgo(task.updatedAt)}`
    : `Added ${timeAgo(task.createdAt)}`;

  li.innerHTML = `
    <!-- Bulk-select checkbox -->
    <input
      type="checkbox"
      class="task-checkbox"
      aria-label="Select task"
      ${checkedIds.has(task.id) ? "checked" : ""}
    />

    <!-- Complete toggle -->
    <button
      class="task-complete-btn"
      aria-label="${task.completed ? "Mark as active" : "Mark as complete"}"
      title="${task.completed ? "Mark as active" : "Mark as complete"}"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="2,6 5,9 10,3"/>
      </svg>
    </button>

    <!-- Body -->
    <div class="task-body">
      <span class="task-text">${escapeHtml(task.text)}</span>
      <p class="task-meta">${metaText}</p>
    </div>

    <!-- Action buttons -->
    <div class="task-actions">
      <button class="task-btn task-btn--edit edit-btn"   title="Edit task"   aria-label="Edit task">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="task-btn task-btn--save save-btn"   title="Save edit"   aria-label="Save edit">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button class="task-btn task-btn--cancel cancel-btn" title="Cancel edit" aria-label="Cancel edit">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <button class="task-btn task-btn--delete delete-btn" title="Delete task" aria-label="Delete task">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  `;

  // ── Wire events ──────────────────────────────────────────

  // Bulk checkbox
  const checkbox = li.querySelector<HTMLInputElement>(".task-checkbox")!;
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      checkedIds.add(task.id);
    } else {
      checkedIds.delete(task.id);
    }
    updateBulkActions();
  });

  // Complete toggle
  li.querySelector<HTMLButtonElement>(".task-complete-btn")!.addEventListener("click", () => {
    toggleComplete(task.id);
  });

  // Edit
  li.querySelector<HTMLButtonElement>(".edit-btn")!.addEventListener("click", () => {
    startEdit(li, task);
  });

  // Delete
  li.querySelector<HTMLButtonElement>(".delete-btn")!.addEventListener("click", async () => {
    const confirmed = await showConfirm(`Delete "${task.text}"?`);
    if (confirmed) deleteTask(task.id);
  });

  return li;
}

// Simple HTML escape to prevent XSS
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Edit mode ─────────────────────────────────────────────────

function startEdit(li: HTMLLIElement, task: Task): void {
  const textEl = li.querySelector<HTMLSpanElement>(".task-text")!;
  const currentText = task.text;

  // Replace text span with an input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-edit-input";
  input.value = currentText;
  input.maxLength = 200;
  textEl.replaceWith(input);

  li.classList.add("editing");
  input.focus();
  input.select();

  // Save on save button click
  const saveBtn = li.querySelector<HTMLButtonElement>(".save-btn")!;
  saveBtn.addEventListener("click", () => commitEdit(li, task, input), { once: true });

  // Save on Enter, cancel on Escape
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  commitEdit(li, task, input);
    if (e.key === "Escape") cancelEdit(li, task, input);
  });

  // Cancel button
  const cancelBtn = li.querySelector<HTMLButtonElement>(".cancel-btn")!;
  cancelBtn.addEventListener("click", () => cancelEdit(li, task, input), { once: true });
}

function commitEdit(li: HTMLLIElement, task: Task, input: HTMLInputElement): void {
  const newText = input.value.trim();
  if (!newText) {
    showToast("Task can't be empty.", "error");
    input.focus();
    return;
  }

  if (newText === task.text) {
    cancelEdit(li, task, input); // no change → just cancel
    return;
  }

  // Update in tasks array
  const index = tasks.findIndex((t) => t.id === task.id);
  if (index !== -1) {
    tasks[index].text      = newText;
    tasks[index].updatedAt = Date.now();
  }

  persist();
  renderTasks();
  showToast("Task updated.", "success");
}

function cancelEdit(li: HTMLLIElement, task: Task, input: HTMLInputElement): void {
  // Restore original text span
  const span = document.createElement("span");
  span.className = "task-text";
  span.textContent = task.text;
  input.replaceWith(span);
  li.classList.remove("editing");
}

// ── CRUD ─────────────────────────────────────────────────────

function addTask(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    showToast("Please enter a task first.", "error");
    return;
  }

  const newTask: Task = {
    id:        generateId(),
    text:      trimmed,
    completed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  tasks.unshift(newTask); // newest first
  persist();
  renderTasks();
  showToast("Task added.", "success");
}

function deleteTask(id: string): void {
  tasks = tasks.filter((t) => t.id !== id);
  checkedIds.delete(id);
  persist();
  renderTasks();
  showToast("Task deleted.", "info");
}

function toggleComplete(id: string): void {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  persist();
  renderTasks();
}

async function deleteSelected(): Promise<void> {
  if (checkedIds.size === 0) return;
  const confirmed = await showConfirm(
    `Delete ${checkedIds.size} selected task${checkedIds.size > 1 ? "s" : ""}?`
  );
  if (!confirmed) return;

  tasks = tasks.filter((t) => !checkedIds.has(t.id));
  checkedIds.clear();
  persist();
  renderTasks();
  showToast("Selected tasks deleted.", "info");
}

async function clearAll(): Promise<void> {
  if (tasks.length === 0) {
    showToast("No tasks to clear.", "error");
    return;
  }
  const confirmed = await showConfirm("Delete all tasks? This cannot be undone.");
  if (!confirmed) return;

  tasks = [];
  checkedIds.clear();
  persist();
  renderTasks();
  showToast("All tasks cleared.", "info");
}

// ── Persist to localStorage ───────────────────────────────────

function persist(): void {
  saveUserTasks(currentUser, tasks);
}

// ── Render ───────────────────────────────────────────────────

function renderTasks(): void {
  const list      = document.getElementById("taskList")!;
  const emptyState = document.getElementById("emptyState")!;
  const emptyText  = document.getElementById("emptyText")!;

  const filtered = getFilteredTasks();
  list.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    if (tasks.length === 0) {
      emptyText.textContent = "No tasks yet — add one above.";
    } else {
      emptyText.textContent =
        currentFilter === "active"
          ? "No active tasks. Well done!"
          : "No completed tasks yet.";
    }
  } else {
    emptyState.classList.add("hidden");
    filtered.forEach((task) => {
      list.appendChild(createTaskElement(task));
    });
  }

  updateStats();
  updateBulkActions();
}

// ── Bulk actions bar ──────────────────────────────────────────

function updateBulkActions(): void {
  const bar         = document.getElementById("bulkActions")!;
  const countEl     = document.getElementById("selectedCount")!;
  const count       = checkedIds.size;

  if (count > 0) {
    bar.classList.add("visible");
    countEl.textContent = `${count} selected`;
  } else {
    bar.classList.remove("visible");
  }
}

// ── Filter tab UI ─────────────────────────────────────────────

function setFilter(filter: Filter): void {
  currentFilter = filter;
  checkedIds.clear();

  document.querySelectorAll<HTMLButtonElement>(".filter-tab").forEach((btn) => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  renderTasks();
}

// ── Time-ago live update (every 30 seconds) ───────────────────

function startTimeAgoInterval(): void {
  setInterval(() => {
    // Update only the meta elements without full re-render
    const items = document.querySelectorAll<HTMLLIElement>(".task-item");
    items.forEach((li) => {
      const id   = li.dataset.id!;
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      const metaEl = li.querySelector<HTMLParagraphElement>(".task-meta");
      if (!metaEl) return;
      const wasEdited = task.updatedAt > task.createdAt + 2000;
      metaEl.textContent = wasEdited
        ? `Edited ${timeAgo(task.updatedAt)}`
        : `Added ${timeAgo(task.createdAt)}`;
    });
  }, 30_000);
}

// ── Login / Logout ─────────────────────────────────────────────

function login(username: string): void {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) {
    showToast("Please enter a username.", "error");
    return;
  }

  currentUser = trimmed;
  localStorage.setItem(STORAGE_KEY_USER, trimmed);
  tasks = loadUserTasks(trimmed);
  checkedIds.clear();
  currentFilter = "all";

  // Update header
  document.getElementById("headerUsername")!.textContent = trimmed;

  // Switch screens
  document.getElementById("loginScreen")!.classList.add("hidden");
  document.getElementById("appScreen")!.classList.remove("hidden");

  // Reset filter tabs
  setFilter("all");
  renderTasks();
  startTimeAgoInterval();
}

function logout(): void {
  currentUser = "";
  tasks = [];
  checkedIds.clear();
  localStorage.removeItem(STORAGE_KEY_USER);

  document.getElementById("appScreen")!.classList.add("hidden");
  document.getElementById("loginScreen")!.classList.remove("hidden");

  const usernameInput = document.getElementById("usernameInput") as HTMLInputElement;
  usernameInput.value = "";
  usernameInput.focus();
}

// ── Bootstrap ─────────────────────────────────────────────────

function init(): void {
  // ── DOM refs ──────────────────────────────────────────────
  const usernameInput = document.getElementById("usernameInput") as HTMLInputElement;
  const loginBtn      = document.getElementById("loginBtn")      as HTMLButtonElement;
  const logoutBtn     = document.getElementById("logoutBtn")     as HTMLButtonElement;
  const taskInput     = document.getElementById("taskInput")     as HTMLInputElement;
  const addBtn        = document.getElementById("addBtn")        as HTMLButtonElement;
  const clearAllBtn   = document.getElementById("clearAllBtn")   as HTMLButtonElement;
  const deleteSelBtn  = document.getElementById("deleteSelectedBtn") as HTMLButtonElement;

  // ── Login ─────────────────────────────────────────────────
  loginBtn.addEventListener("click", () => login(usernameInput.value));
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login(usernameInput.value);
  });

  // ── Logout ────────────────────────────────────────────────
  logoutBtn.addEventListener("click", logout);

  // ── Add task ──────────────────────────────────────────────
  addBtn.addEventListener("click", () => {
    addTask(taskInput.value);
    taskInput.value = "";
    taskInput.focus();
  });

  taskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addTask(taskInput.value);
      taskInput.value = "";
    }
  });

  // ── Filter tabs ───────────────────────────────────────────
  document.querySelectorAll<HTMLButtonElement>(".filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFilter(btn.dataset.filter as Filter);
    });
  });

  // ── Delete selected ───────────────────────────────────────
  deleteSelBtn.addEventListener("click", deleteSelected);

  // ── Clear all ─────────────────────────────────────────────
  clearAllBtn.addEventListener("click", clearAll);

  // ── Auto-login if user is remembered ─────────────────────
  const savedUser = localStorage.getItem(STORAGE_KEY_USER);
  if (savedUser) {
    usernameInput.value = savedUser;
    login(savedUser);
  } else {
    usernameInput.focus();
  }
}

// Run on DOM ready
document.addEventListener("DOMContentLoaded", init);