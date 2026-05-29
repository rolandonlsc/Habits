/* ========================================
   Calendar Module
   ======================================== */
const Calendar = {
  currentDate: new Date(),
  selectedDate: null,

  monthNames: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ],

  init() {
    document.getElementById('cal-prev').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('cal-next').addEventListener('click', () => this.changeMonth(1));
    this.render();
  },

  changeMonth(delta) {
    this.currentDate.setMonth(this.currentDate.getMonth() + delta);
    this.selectedDate = null;
    document.getElementById('calendar-day-detail').style.display = 'none';
    this.render();
  },

  async render() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    document.getElementById('cal-month-label').textContent = `${this.monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const fromDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const toDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    let completions = [];
    let habits = [];
    let tasks = [];
    try {
      [completions, habits, tasks] = await Promise.all([
        API.habits.getCompletionsRange(fromDate, toDate),
        API.habits.getAll(),
        API.tasks.getAll() // For calendar, we can filter client-side or we'd need a range API for tasks too. For simplicity, just fetch all and filter client side.
      ]);
    } catch (e) {
      console.error('Failed to load calendar data:', e);
      return;
    }

    const completionsByDate = {};
    completions.forEach(c => {
      if (!completionsByDate[c.completed_date]) completionsByDate[c.completed_date] = [];
      completionsByDate[c.completed_date].push(c);
    });

    const tasksByDate = {};
    tasks.forEach(t => {
      if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = [];
      tasksByDate[t.due_date].push(t);
    });

    const grid = document.getElementById('calendar-grid');
    const headers = grid.querySelectorAll('.cal-day-header');
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));

    const todayStr = new Date().toISOString().split('T')[0];

    // Prev month
    for (let i = startDay - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'cal-day other-month';
      cell.textContent = daysInPrevMonth - i;
      grid.appendChild(cell);
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      cell.textContent = day;

      if (dateStr === todayStr) cell.classList.add('today');
      if (this.selectedDate === dateStr) cell.classList.add('selected');

      const dayComps = completionsByDate[dateStr] || [];
      const dayTasks = tasksByDate[dateStr] || [];
      
      const dayOfWeek = new Date(dateStr).getDay();
      const scheduledHabits = habits.filter(h => h.days_of_week.split(',').map(Number).includes(dayOfWeek));

      // Visual indicator logic
      // We will show dots if there are tasks OR habits
      if (scheduledHabits.length > 0 || dayTasks.length > 0) {
        let totalItems = scheduledHabits.length + dayTasks.length;
        let completedItems = dayComps.length + dayTasks.filter(t => t.status === 'completed' || t.status === 'closed').length;
        
        const dot = document.createElement('span');
        dot.className = 'completion-dot';
        
        if (completedItems === 0) {
          dot.style.background = 'var(--text-muted)';
        } else if (completedItems >= totalItems) {
          dot.style.background = 'var(--accent-secondary)';
        } else {
          dot.style.background = 'var(--accent-warning)';
        }
        cell.appendChild(dot);
      }

      cell.addEventListener('click', () => this.selectDay(dateStr, day, dayComps, habits, dayTasks));
      grid.appendChild(cell);
    }

    // Next month
    const totalCells = grid.querySelectorAll('.cal-day').length;
    const remaining = 42 - totalCells;
    for (let i = 1; i <= remaining; i++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day other-month';
      cell.textContent = i;
      grid.appendChild(cell);
    }
  },

  selectDay(dateStr, dayNum, completions, allHabits, tasks) {
    this.selectedDate = dateStr;
    document.querySelectorAll('.cal-day.selected').forEach(el => el.classList.remove('selected'));
    
    const grid = document.getElementById('calendar-grid');
    const days = grid.querySelectorAll('.cal-day:not(.other-month)');
    days.forEach(d => {
      if (d.textContent == dayNum && !d.classList.contains('other-month')) d.classList.add('selected');
    });

    const detail = document.getElementById('calendar-day-detail');
    const dateObj = new Date(dateStr + 'T12:00:00');
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    document.getElementById('cal-detail-date').textContent = `${dayNames[dateObj.getDay()]} ${dayNum} de ${this.monthNames[dateObj.getMonth()]}`;

    // Render Habits
    const habitsList = document.getElementById('cal-detail-habits-list');
    habitsList.innerHTML = '';
    const dayOfWeek = dateObj.getDay();
    const scheduledHabits = allHabits.filter(h => h.days_of_week.split(',').map(Number).includes(dayOfWeek));

    if (scheduledHabits.length === 0) {
      habitsList.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary);padding:4px 0;">No hay hábitos para este día.</p>';
    } else {
      scheduledHabits.forEach(habit => {
        const isCompleted = completions.some(c => c.habit_id === habit.id);
        habitsList.innerHTML += `
          <div class="cal-detail-item">
            <span>${habit.icon}</span>
            <span class="cal-detail-name">${habit.name}</span>
            <span class="cal-detail-status ${isCompleted ? 'done' : 'missed'}">${isCompleted ? '✓ Hecho' : '✗ Pendiente'}</span>
          </div>`;
      });
    }

    // Render Tasks
    const tasksList = document.getElementById('cal-detail-tasks-list');
    tasksList.innerHTML = '';
    if (tasks.length === 0) {
      tasksList.innerHTML = '<p style="font-size:0.8rem;color:var(--text-secondary);padding:4px 0;">No hay tareas para este día.</p>';
    } else {
      tasks.forEach(task => {
        const isDone = task.status === 'completed' || task.status === 'closed';
        tasksList.innerHTML += `
          <div class="cal-detail-item">
            <span style="color: ${task.label_color}">●</span>
            <span class="cal-detail-name">${task.title} ${task.due_time ? `(${task.due_time})` : ''}</span>
            <span class="cal-detail-status ${isDone ? 'done' : 'neutral'}">${isDone ? '✓ ' + task.status : '⏳ ' + task.status}</span>
          </div>`;
      });
    }

    detail.style.display = 'block';
    detail.style.animation = 'none';
    detail.offsetHeight;
    detail.style.animation = 'slideUp 0.3s ease';
  }
};
