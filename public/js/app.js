/* ========================================
   Main Application Controller
   ======================================== */
const App = {
  habits: [],
  tasks: [],
  todayCompletions: new Set(),
  today: new Date().toISOString().split('T')[0],

  /* ---- INIT ---- */
  async init() {
    this.setupTheme();
    
    // Auth Check
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
      this.showAuthView();
      return;
    }

    // Authenticated init
    this.setupGreeting();
    this.setupNavigation();
    this.setupHabitModal();
    this.setupTaskModal();
    this.setupConfirmDialog();
    this.setupAuthActions();
    this.setupKanbanDragDrop();

    document.getElementById('task-date').value = this.today;
    document.getElementById('tasks-date-badge').textContent = this.formatDate(this.today);

    try {
      await Promise.all([
        this.loadHabits(),
        this.loadTasks(),
      ]);
      this.loadStats();
      Calendar.init();
    } catch(e) {
      // Handled by API module (reloads on 401)
    }
  },

  /* ---- THEME ---- */
  setupTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const toggleBtn = document.getElementById('btn-theme-toggle');
    if(toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      });
    }
  },

  /* ---- AUTH ---- */
  showAuthView() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-auth').style.display = 'flex';
    document.getElementById('view-auth').classList.add('active');
    document.getElementById('bottom-nav').style.display = 'none';

    const form = document.getElementById('auth-form');
    document.getElementById('btn-login').addEventListener('click', async (e) => {
      e.preventDefault();
      const u = document.getElementById('auth-username').value;
      const p = document.getElementById('auth-password').value;
      try {
        const res = await API.auth.login(u, p);
        localStorage.setItem('user', JSON.stringify(res));
        window.location.reload();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-register').addEventListener('click', async (e) => {
      e.preventDefault();
      const u = document.getElementById('auth-username').value;
      const p = document.getElementById('auth-password').value;
      try {
        const res = await API.auth.register(u, p);
        localStorage.setItem('user', JSON.stringify(res));
        window.location.reload();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    });
  },

  setupAuthActions() {
    document.getElementById('btn-logout').addEventListener('click', () => {
      localStorage.removeItem('user');
      window.location.reload();
    });
  },

  /* ---- GREETING ---- */
  setupGreeting() {
    const hour = new Date().getHours();
    let greeting;
    if (hour < 12) greeting = 'Buenos días ☀️';
    else if (hour < 18) greeting = 'Buenas tardes 🌤️';
    else greeting = 'Buenas noches 🌙';
    const user = JSON.parse(localStorage.getItem('user'));
    document.getElementById('greeting-text').textContent = `${greeting}, ${user.username}`;
  },

  /* ---- NAVIGATION ---- */
  setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });
  },

  switchView(viewName) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

    document.querySelectorAll('.view').forEach(v => {
      v.classList.remove('active');
      v.style.display = ''; // reset inline display from auth
    });
    
    const target = document.getElementById(`view-${viewName}`);
    target.classList.add('active');
    target.style.animation = 'none';
    target.offsetHeight;
    target.style.animation = 'viewFadeIn 0.3s ease';

    if (viewName === 'calendar') Calendar.render();
    if (viewName === 'tasks') this.loadTasks();
  },

  /* ---- STATS ---- */
  async loadStats() {
    try {
      const stats = await API.stats.get();
      document.getElementById('streak-count').textContent = stats.currentStreak;

      const total = this.getTodayScheduledCount();
      const completed = this.todayCompletions.size;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      document.getElementById('progress-percent').textContent = `${percent}%`;
      document.getElementById('progress-detail').textContent = `${completed} de ${total} completados`;

      const circumference = 2 * Math.PI * 34;
      const offset = circumference - (percent / 100) * circumference;
      document.getElementById('progress-ring-fill').style.strokeDashoffset = offset;
    } catch (e) {
      console.error('Stats error:', e);
    }
  },

  getTodayScheduledCount() {
    const todayDow = new Date().getDay();
    return this.habits.filter(h => h.days_of_week.split(',').map(Number).includes(todayDow)).length;
  },

  /* ========================================
     HABITS
     ======================================== */
  async loadHabits() {
    try {
      this.habits = await API.habits.getAll();
      this.todayCompletions.clear();

      for (const habit of this.habits) {
        try {
          const completions = await API.habits.getCompletions(habit.id, this.today, this.today);
          if (completions.length > 0) this.todayCompletions.add(habit.id);
        } catch (e) { }
      }

      this.renderHabits();
    } catch (e) {
      this.showToast('Error al cargar hábitos', 'error');
    }
  },

  renderHabits() {
    const container = document.getElementById('habits-list');
    const empty = document.getElementById('empty-habits');
    const todayDow = new Date().getDay();
    
    const todayHabits = this.habits.filter(h => h.days_of_week.split(',').map(Number).includes(todayDow));
    const otherHabits = this.habits.filter(h => !h.days_of_week.split(',').map(Number).includes(todayDow));

    container.innerHTML = '';

    if (this.habits.length === 0) {
      container.appendChild(empty);
      empty.style.display = 'flex';
      return;
    }

    if (todayHabits.length > 0) {
      container.appendChild(this.createDivider('Hoy'));
      todayHabits.forEach((h, i) => container.appendChild(this.createHabitCard(h, i, true)));
    }

    if (otherHabits.length > 0) {
      container.appendChild(this.createDivider('Otros días'));
      otherHabits.forEach((h, i) => container.appendChild(this.createHabitCard(h, i, false)));
    }
  },

  createDivider(label) {
    const div = document.createElement('div');
    div.className = 'section-divider';
    div.innerHTML = `<span>${label}</span>`;
    return div;
  },

  createHabitCard(habit, index, isToday) {
    const isCompleted = this.todayCompletions.has(habit.id);
    const card = document.createElement('div');
    card.className = `habit-card${isCompleted ? ' completed' : ''}`;
    card.style.setProperty('--delay', `${index * 0.05}s`);
    card.style.cssText += `; border-left: 4px solid ${habit.color};`;

    const dayLabels = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' };
    const activeDays = habit.days_of_week.split(',').map(Number).map(d => dayLabels[d]).join(' ');

    const priorityLabels = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };

    card.innerHTML = `
      <div class="habit-icon-wrap" style="background: ${habit.color}20; color: ${habit.color}">${habit.icon}</div>
      <div class="habit-info">
        <div class="habit-name">${habit.name}</div>
        <div class="habit-meta">
          <span class="habit-meta-item">⏱ ${habit.duration_minutes} min</span>
          <span class="habit-meta-item">📅 ${activeDays}</span>
          <span class="priority-indicator priority-${habit.priority}">${priorityLabels[habit.priority]}</span>
        </div>
      </div>
      ${isToday ? `
      <button class="habit-check ${isCompleted ? 'checked' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      ` : ''}
      <div class="habit-actions">
        <button class="action-btn edit" title="Editar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="action-btn delete" title="Eliminar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>
    `;

    const checkBtn = card.querySelector('.habit-check');
    if (checkBtn) {
      checkBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleHabitCompletion(habit.id, checkBtn, card); });
    }

    card.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); this.openHabitModal(habit); });
    card.querySelector('.delete').addEventListener('click', (e) => { e.stopPropagation(); this.confirmDelete('habit', habit.id, habit.name); });

    return card;
  },

  async toggleHabitCompletion(habitId, checkBtn, card) {
    try {
      const result = await API.habits.toggleComplete(habitId, this.today);
      if (result.completed) {
        this.todayCompletions.add(habitId);
        checkBtn.classList.add('checked', 'complete-pulse');
        card.classList.add('completed');
      } else {
        this.todayCompletions.delete(habitId);
        checkBtn.classList.remove('checked', 'complete-pulse');
        card.classList.remove('completed');
      }
      this.loadStats();
    } catch (e) {
      this.showToast('Error al actualizar', 'error');
    }
  },

  /* ---- HABIT MODAL ---- */
  setupHabitModal() {
    const modal = document.getElementById('modal-habit');
    document.getElementById('fab-add-habit').addEventListener('click', () => this.openHabitModal());
    document.getElementById('btn-cancel-habit').addEventListener('click', () => this.closeModal('modal-habit'));
    modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal('modal-habit'); });

    document.getElementById('icon-picker').addEventListener('click', (e) => {
      const btn = e.target.closest('.icon-opt');
      if (!btn) return;
      document.querySelectorAll('#icon-picker .icon-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });

    document.getElementById('color-picker').addEventListener('click', (e) => {
      const btn = e.target.closest('.color-opt');
      if (!btn) return;
      document.querySelectorAll('#color-picker .color-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });

    document.getElementById('days-picker').addEventListener('click', (e) => {
      const btn = e.target.closest('.day-opt');
      if (!btn) return;
      btn.classList.toggle('selected');
    });

    document.getElementById('habit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveHabit();
    });
  },

  openHabitModal(habit = null) {
    const title = document.getElementById('modal-habit-title');
    if (habit) {
      title.textContent = 'Editar Hábito';
      document.getElementById('habit-id').value = habit.id;
      document.getElementById('habit-name').value = habit.name;
      document.getElementById('habit-description').value = habit.description || '';
      document.getElementById('habit-duration').value = habit.duration_minutes;
      document.getElementById('habit-priority').value = habit.priority;

      document.querySelectorAll('#icon-picker .icon-opt').forEach(b => b.classList.toggle('selected', b.dataset.icon === habit.icon));
      document.querySelectorAll('#color-picker .color-opt').forEach(b => b.classList.toggle('selected', b.dataset.color === habit.color));
      const days = habit.days_of_week.split(',').map(Number);
      document.querySelectorAll('#days-picker .day-opt').forEach(b => b.classList.toggle('selected', days.includes(Number(b.dataset.day))));
    } else {
      title.textContent = 'Nuevo Hábito';
      document.getElementById('habit-form').reset();
      document.getElementById('habit-id').value = '';
      document.getElementById('habit-duration').value = 30;
      document.querySelectorAll('#icon-picker .icon-opt').forEach((b, i) => b.classList.toggle('selected', i === 0));
      document.querySelectorAll('#color-picker .color-opt').forEach((b, i) => b.classList.toggle('selected', i === 0));
      document.querySelectorAll('#days-picker .day-opt').forEach(b => b.classList.add('selected'));
    }
    document.getElementById('modal-habit').style.display = 'flex';
  },

  async saveHabit() {
    const id = document.getElementById('habit-id').value;
    const name = document.getElementById('habit-name').value.trim();
    if (!name) return this.showToast('El nombre es requerido', 'error');

    const selectedIcon = document.querySelector('#icon-picker .icon-opt.selected');
    const selectedColor = document.querySelector('#color-picker .color-opt.selected');
    const selectedDays = Array.from(document.querySelectorAll('#days-picker .day-opt.selected')).map(b => b.dataset.day);

    if (selectedDays.length === 0) return this.showToast('Selecciona al menos un día', 'error');

    const data = {
      name, description: document.getElementById('habit-description').value.trim(),
      icon: selectedIcon ? selectedIcon.dataset.icon : '⭐',
      color: selectedColor ? selectedColor.dataset.color : '#6C5CE7',
      duration_minutes: parseInt(document.getElementById('habit-duration').value) || 30,
      days_of_week: selectedDays.join(','), priority: document.getElementById('habit-priority').value,
    };

    try {
      if (id) await API.habits.update(id, data);
      else await API.habits.create(data);
      this.closeModal('modal-habit');
      await this.loadHabits();
    } catch (e) { this.showToast('Error al guardar: ' + e.message, 'error'); }
  },

  /* ========================================
     TASKS & KANBAN
     ======================================== */
  async loadTasks() {
    try {
      this.tasks = await API.tasks.getAll();
      this.renderKanban();
      this.loadStats();
    } catch (e) {
      console.error('Failed to load tasks:', e);
    }
  },

  renderKanban() {
    // Clear zones
    document.querySelectorAll('.kanban-dropzone').forEach(zone => {
      zone.innerHTML = '';
      // Update count to 0 initially
      zone.parentElement.querySelector('.kanban-count').textContent = '0';
    });

    const statusMap = {
      on_hold: 'zone-on-hold',
      ready: 'zone-ready',
      in_progress: 'zone-in-progress',
      completed: 'zone-completed',
      closed: 'zone-closed'
    };

    const counts = { on_hold:0, ready:0, in_progress:0, completed:0, closed:0 };

    this.tasks.forEach(t => {
      const targetId = statusMap[t.status] || 'zone-ready';
      const zone = document.getElementById(targetId);
      if (zone) {
        zone.appendChild(this.createTaskCard(t));
        counts[t.status] = (counts[t.status] || 0) + 1;
      }
    });

    // Update counts
    Object.keys(counts).forEach(status => {
      const col = document.querySelector(`.kanban-column[data-status="${status}"]`);
      if(col) col.querySelector('.kanban-count').textContent = counts[status];
    });
  },

  createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.dataset.status = task.status;
    card.style.borderLeftColor = task.label_color;

    const priorityLabels = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };

    card.innerHTML = `
      <div class="task-card-header">
        <div class="task-title">${task.title}</div>
        <div class="task-actions" style="display:flex;gap:4px;">
          <button class="action-btn edit" title="Editar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="action-btn delete" title="Eliminar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </div>
      ${task.description ? `<div class="task-desc">${task.description}</div>` : ''}
      <div class="task-footer">
        <span class="priority-indicator priority-${task.priority}">${priorityLabels[task.priority]}</span>
        <div class="task-date-info">
          <span>📅 ${this.formatDate(task.due_date)}</span>
          ${task.due_time ? `<span>🕒 ${task.due_time}</span>` : ''}
        </div>
      </div>
    `;

    // Drag Events
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.kanban-dropzone').forEach(z => z.classList.remove('drag-over'));
    });

    // Actions
    card.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); this.openTaskModal(task); });
    card.querySelector('.delete').addEventListener('click', (e) => { e.stopPropagation(); this.confirmDelete('task', task.id, task.title); });

    return card;
  },

  setupKanbanDragDrop() {
    document.querySelectorAll('.kanban-dropzone').forEach(zone => {
      zone.addEventListener('dragover', e => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
      });

      zone.addEventListener('drop', async e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain');
        if (!taskId) return;
        
        const newStatus = zone.parentElement.dataset.status;
        const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
        
        if (card && card.dataset.status !== newStatus) {
          // Optimistic UI update
          zone.appendChild(card);
          card.dataset.status = newStatus;
          this.updateKanbanCounts();

          try {
            await API.tasks.update(taskId, { status: newStatus });
            this.loadStats();
          } catch(err) {
            this.showToast('Error al mover tarea', 'error');
            this.loadTasks(); // Revert
          }
        }
      });
    });
  },

  updateKanbanCounts() {
    document.querySelectorAll('.kanban-column').forEach(col => {
      const count = col.querySelectorAll('.task-card').length;
      col.querySelector('.kanban-count').textContent = count;
    });
  },

  /* ---- TASK MODAL ---- */
  setupTaskModal() {
    const modal = document.getElementById('modal-task');
    document.getElementById('fab-add-task').addEventListener('click', () => this.openTaskModal());
    document.getElementById('btn-cancel-task').addEventListener('click', () => this.closeModal('modal-task'));
    modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal('modal-task'); });

    document.getElementById('task-color-picker').addEventListener('click', (e) => {
      const btn = e.target.closest('.color-opt');
      if (!btn) return;
      document.querySelectorAll('#task-color-picker .color-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });

    document.getElementById('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveTask();
    });
  },

  openTaskModal(task = null) {
    const title = document.getElementById('modal-task-title');
    const statusGroup = document.getElementById('task-status-group');

    if (task) {
      title.textContent = 'Editar Tarea';
      document.getElementById('task-id').value = task.id;
      document.getElementById('task-title').value = task.title;
      document.getElementById('task-description').value = task.description || '';
      document.getElementById('task-priority').value = task.priority;
      document.getElementById('task-date').value = task.due_date;
      document.getElementById('task-time').value = task.due_time || '';
      
      document.getElementById('task-status').value = task.status;
      document.getElementById('task-status-select').value = task.status;
      statusGroup.style.display = 'block';

      document.querySelectorAll('#task-color-picker .color-opt').forEach(b => {
        b.classList.toggle('selected', b.dataset.color === task.label_color);
      });
    } else {
      title.textContent = 'Nueva Tarea';
      document.getElementById('task-form').reset();
      document.getElementById('task-id').value = '';
      document.getElementById('task-date').value = this.today;
      document.getElementById('task-status').value = 'ready';
      statusGroup.style.display = 'none'; // Hide status select for new tasks

      document.querySelectorAll('#task-color-picker .color-opt').forEach((b, i) => b.classList.toggle('selected', i === 0));
    }

    document.getElementById('modal-task').style.display = 'flex';
  },

  async saveTask() {
    const id = document.getElementById('task-id').value;
    const title = document.getElementById('task-title').value.trim();
    if (!title) return this.showToast('El título es requerido', 'error');

    const selectedColor = document.querySelector('#task-color-picker .color-opt.selected');
    const statusVal = id ? document.getElementById('task-status-select').value : 'ready';

    const data = {
      title,
      description: document.getElementById('task-description').value.trim(),
      priority: document.getElementById('task-priority').value,
      due_date: document.getElementById('task-date').value || this.today,
      due_time: document.getElementById('task-time').value,
      label_color: selectedColor ? selectedColor.dataset.color : '#00B894',
      status: statusVal
    };

    try {
      if (id) await API.tasks.update(id, data);
      else await API.tasks.create(data);
      this.closeModal('modal-task');
      await this.loadTasks();
    } catch (e) { this.showToast('Error al guardar: ' + e.message, 'error'); }
  },

  /* ========================================
     CONFIRM DIALOG
     ======================================== */
  _confirmCallback: null,

  setupConfirmDialog() {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('btn-confirm-cancel').addEventListener('click', () => this.closeModal('modal-confirm'));
    document.getElementById('btn-confirm-ok').addEventListener('click', () => {
      if (this._confirmCallback) this._confirmCallback();
      this.closeModal('modal-confirm');
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal('modal-confirm'); });
  },

  confirmDelete(type, id, name) {
    document.getElementById('confirm-message').textContent = `¿Estás seguro de que quieres eliminar "${name}"? Esta acción no se puede deshacer.`;
    document.getElementById('modal-confirm').style.display = 'flex';

    this._confirmCallback = async () => {
      try {
        if (type === 'habit') {
          await API.habits.delete(id);
          await this.loadHabits();
        } else {
          await API.tasks.delete(id);
          await this.loadTasks();
        }
      } catch (e) {
        this.showToast('Error al eliminar', 'error');
      }
    };
  },

  /* ========================================
     UTILITIES
     ======================================== */
  closeModal(id) {
    const modal = document.getElementById(id);
    const sheet = modal.querySelector('.modal-sheet');
    sheet.style.animation = 'none'; sheet.offsetHeight; sheet.style.animation = 'sheetDown 0.25s ease forwards';
    setTimeout(() => { modal.style.display = 'none'; sheet.style.animation = ''; }, 250);
  },

  formatDate(dateStr) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getDate()} ${months[d.getMonth()]}`;
  },

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`; toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
