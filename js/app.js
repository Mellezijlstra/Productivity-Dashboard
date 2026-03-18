// ==========================================
// CONFIG & STATE
// ==========================================

const PHASE_DATE = new Date('2025-05-01'); // Driving exam / phase flip date
const KCAL_PER_KG = 7700;                  // kcal per kg fat (matches 3500kcal / 0.454kg)

const DEFAULT_COURSES = [
  { name: 'Elements of AI', platform: 'MinnaLearn / University of Helsinki', description: 'Broad intro to AI concepts. Already in progress.', status: 'in_progress', order_index: 0 },
  { name: 'AI for Everyone', platform: 'Coursera / DeepLearning.AI', description: 'Andrew Ng\'s non-technical foundation. ~6 hours. Do this early.', status: 'not_started', order_index: 1 },
  { name: 'AI Safety Fundamentals — Alignment Track', platform: 'BlueDot Impact', description: '8-week cohort, ~3 hrs/week. Most respected entry into safety/governance community.', status: 'not_started', order_index: 2 },
  { name: 'Google ML Crash Course', platform: 'Google', description: 'Technical vocabulary for policy discussions. ~15 hours.', status: 'not_started', order_index: 3 },
  { name: 'fast.ai Part 1 (Lessons 1–3)', platform: 'fast.ai', description: 'Actually build something. Changes how you think. ~6 hours.', status: 'not_started', order_index: 4 },
  { name: 'AI Safety Fundamentals — Governance Track', platform: 'BlueDot Impact', description: 'Policy frameworks, compute governance, international coordination.', status: 'not_started', order_index: 5 },
  { name: 'Responsible AI', platform: 'Alan Turing Institute / edX', description: 'EU AI Act, government AI procurement. 4–6 weeks.', status: 'not_started', order_index: 6 },
  { name: 'AI Ethics', platform: 'Oxford / edX', description: 'Your philosophy background is a differentiator here. ~20 hours.', status: 'not_started', order_index: 7 },
];

const DEFAULT_HABITS = [
  { name: 'Logged weight today', auto_type: 'weight', order_index: 0 },
  { name: 'Logged calories today', auto_type: 'calories', order_index: 1 },
  { name: 'Studied AI today', auto_type: 'study', order_index: 2 },
  { name: 'Trained today', auto_type: null, order_index: 3 },
  { name: '7+ hours sleep', auto_type: null, order_index: 4 },
  { name: 'No alcohol', auto_type: null, order_index: 5 },
  { name: '10k steps', auto_type: null, order_index: 6 },
  { name: 'No doom scrolling', auto_type: null, order_index: 7 },
  { name: 'Read / learning', auto_type: null, order_index: 8 },
  { name: 'Morning routine', auto_type: null, order_index: 9 },
  { name: 'Tidy room', auto_type: null, order_index: 10 },
];

const SETUP_SQL = `-- Productivity Dashboard — Supabase Setup SQL
-- Run this entire block in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT,
  description TEXT,
  status TEXT DEFAULT 'not_started',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS study_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  duration_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weight_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  weight DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  calories INTEGER DEFAULT 0,
  protein DECIMAL(6,1) DEFAULT 0,
  carbs DECIMAL(6,1) DEFAULT 0,
  fat DECIMAL(6,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  auto_type TEXT,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(habit_id, date)
);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE study_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE habits DISABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs DISABLE ROW LEVEL SECURITY;`;

let db = null;
let weightChart = null;

const state = {
  courses: [],
  studyLogs: [],
  weightLogs: [],
  nutritionLogs: [],
  habits: [],
  habitLogs: [],
  settings: {},
  selectedDeficit: 500,
  currentWeekOffset: 0,
  currentMonthOffset: 0,
};

// ==========================================
// UTILS
// ==========================================

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysBetween(d1, d2) {
  const ms = new Date(d2) - new Date(d1);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function getWeekDates(offset = 0) {
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + offset * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

function getSetting(key, fallback = null) {
  return state.settings[key] !== undefined ? state.settings[key] : fallback;
}

// ==========================================
// SUPABASE INIT & SETUP
// ==========================================

document.getElementById('setup-sql-preview').textContent = SETUP_SQL;

function copySetupSQL() {
  navigator.clipboard.writeText(SETUP_SQL).then(() => {
    const btn = document.querySelector('.btn-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}

async function initializeApp() {
  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();

  if (!url || !key) { showToast('Please enter both URL and key', 'error'); return; }
  if (!url.includes('supabase.co')) { showToast('URL should be your Supabase project URL', 'error'); return; }

  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  await launchApp(url, key);
}

function resetSetup() {
  if (!confirm('This will disconnect your database. Are you sure?')) return;
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('setup-screen').style.display = 'flex';
}

async function launchApp(url, key) {
  try {
    db = window.supabase.createClient(url, key);
    await seedDataIfEmpty();
    await loadAllData();
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    updateSidebarDate();
    navigate('home');
  } catch (err) {
    console.error(err);
    showToast('Connection failed. Check your URL and key.', 'error');
  }
}

async function seedDataIfEmpty() {
  const { data: courses } = await db.from('courses').select('id').limit(1);
  if (!courses || courses.length === 0) {
    await db.from('courses').insert(DEFAULT_COURSES);
  }
  const { data: habits } = await db.from('habits').select('id').limit(1);
  if (!habits || habits.length === 0) {
    await db.from('habits').insert(DEFAULT_HABITS);
  }
  // Seed default settings
  const defaults = { goal_weight: '76', selected_deficit: '500' };
  for (const [k, v] of Object.entries(defaults)) {
    await db.from('settings').upsert({ key: k, value: v }, { onConflict: 'key', ignoreDuplicates: true });
  }
}

// ==========================================
// DATABASE OPERATIONS
// ==========================================

async function loadAllData() {
  const [
    { data: courses },
    { data: studyLogs },
    { data: weightLogs },
    { data: nutritionLogs },
    { data: habits },
    { data: habitLogs },
    { data: settings },
  ] = await Promise.all([
    db.from('courses').select('*').order('order_index'),
    db.from('study_logs').select('*').order('date', { ascending: false }),
    db.from('weight_logs').select('*').order('date'),
    db.from('nutrition_logs').select('*').order('date'),
    db.from('habits').select('*').eq('is_active', true).order('order_index'),
    db.from('habit_logs').select('*'),
    db.from('settings').select('*'),
  ]);

  state.courses = courses || [];
  state.studyLogs = studyLogs || [];
  state.weightLogs = weightLogs || [];
  state.nutritionLogs = nutritionLogs || [];
  state.habits = (habits || []).filter(h => h.is_active);
  state.habitLogs = habitLogs || [];
  state.settings = Object.fromEntries((settings || []).map(s => [s.key, s.value]));
  state.selectedDeficit = parseInt(getSetting('selected_deficit', '500'));
}

async function saveSetting(key, value) {
  await db.from('settings').upsert({ key, value: String(value) }, { onConflict: 'key' });
  state.settings[key] = String(value);
}

// ==========================================
// NAVIGATION
// ==========================================

function navigate(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`${section}-section`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn, .bottom-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === section);
  });

  if (section === 'home') renderHome();
  if (section === 'ai') renderAI();
  if (section === 'fitness') renderFitness();
  if (section === 'habits') renderHabits();
}

function updateSidebarDate() {
  const el = document.getElementById('sidebar-date');
  if (el) {
    el.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
}

// ==========================================
// TDEE ALGORITHM
// ==========================================

function calculateAdaptiveTDEE() {
  const pairs = [];
  state.weightLogs.forEach(w => {
    const n = state.nutritionLogs.find(n => n.date === w.date);
    if (n && n.calories > 0) {
      pairs.push({ date: new Date(w.date + 'T00:00:00'), weight: parseFloat(w.weight), calories: parseInt(n.calories) });
    }
  });

  if (pairs.length < 3) return { tdee: null, confidence: 'insufficient', dataPoints: pairs.length };

  pairs.sort((a, b) => a.date - b.date);
  const n = pairs.length;
  const avgCalories = pairs.reduce((s, p) => s + p.calories, 0) / n;
  const firstWeight = pairs[0].weight;
  const lastWeight = pairs[n - 1].weight;
  const daySpan = (pairs[n - 1].date - pairs[0].date) / 86400000;

  if (daySpan < 1) return { tdee: null, confidence: 'insufficient', dataPoints: n };

  const weightChangePerDay = (lastWeight - firstWeight) / daySpan;
  const tdee = Math.round(avgCalories - weightChangePerDay * KCAL_PER_KG);

  const confidence = n < 7 ? 'low' : n < 14 ? 'medium' : n < 28 ? 'good' : 'high';
  return { tdee, confidence, dataPoints: n };
}

function getCutProjection() {
  const { tdee } = calculateAdaptiveTDEE();
  if (!tdee) return null;

  const goalWeight = parseFloat(getSetting('goal_weight', '76'));
  const latestWeight = state.weightLogs.length > 0
    ? parseFloat(state.weightLogs[state.weightLogs.length - 1].weight)
    : null;

  if (!latestWeight) return null;

  const deficit = state.selectedDeficit;
  const tolose = latestWeight - goalWeight;
  if (tolose <= 0) return { done: true, latestWeight, goalWeight };

  const daysToGoal = Math.ceil((tolose * KCAL_PER_KG) / deficit);
  const endDate = addDays(todayStr(), daysToGoal);
  const targetCals = tdee - deficit;
  const weeklyLoss = (deficit * 7) / KCAL_PER_KG;

  return { daysToGoal, endDate, targetCals, weeklyLoss: weeklyLoss.toFixed(2), latestWeight, goalWeight, tolose: tolose.toFixed(1), done: false };
}

// ==========================================
// AI SECTION
// ==========================================

function renderAI() {
  initTimerCourseSelect();
  renderPhaseBanner();
  renderAIStats();
  renderCourseGrid();
}

function renderPhaseBanner() {
  const banner = document.getElementById('phase-banner');
  const label = document.getElementById('phase-label');
  const desc = document.getElementById('phase-desc');
  const countdown = document.getElementById('phase-countdown');
  const today = new Date();
  const daysToExam = Math.ceil((PHASE_DATE - today) / 86400000);

  if (today < PHASE_DATE) {
    banner.className = 'phase-banner grind';
    label.textContent = 'GRIND MODE';
    desc.textContent = 'Build AI literacy before the driving exam — then pivot to applications.';
    countdown.innerHTML = `<strong style="font-size:1.4rem;color:var(--ai-light)">${daysToExam}</strong><br>days until<br>phase flip`;
  } else {
    banner.className = 'phase-banner hunt';
    label.textContent = 'JOB HUNT MODE';
    desc.textContent = 'Driving exam done — time to start applying. AI + security / governance.';
    countdown.innerHTML = `Phase flip: <strong style="color:var(--fitness-light)">${formatDateDisplay(PHASE_DATE.toISOString().split('T')[0])}</strong>`;
  }
}

function renderAIStats() {
  const totalMinutes = state.studyLogs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const done = state.courses.filter(c => c.status === 'completed').length;
  const total = state.courses.length;

  document.getElementById('ai-hours-total').textContent = totalHours + 'h';
  document.getElementById('ai-courses-done').textContent = `${done}/${total}`;
  document.getElementById('ai-streak').textContent = calculateStudyStreak();
}

function calculateStudyStreak() {
  const logDates = new Set(state.studyLogs.map(l => l.date));
  let streak = 0;
  let d = todayStr();
  while (logDates.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  // Also check yesterday if not studied today yet
  if (streak === 0) {
    d = addDays(todayStr(), -1);
    while (logDates.has(d)) {
      streak++;
      d = addDays(d, -1);
    }
  }
  return streak;
}

function renderCourseGrid() {
  const grid = document.getElementById('course-grid');
  if (!state.courses.length) {
    grid.innerHTML = '<div class="loading-state">No courses found.</div>';
    return;
  }

  grid.innerHTML = state.courses.map(course => {
    const logs = state.studyLogs.filter(l => l.course_id === course.id);
    const totalMin = logs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    const totalHours = (totalMin / 60).toFixed(1);
    const statusLabel = { not_started: 'Not Started', in_progress: 'In Progress', completed: 'Done' }[course.status] || course.status;

    return `
      <div class="course-card status-${course.status}" onclick="openCourseLogs('${course.id}')">
        <div class="course-card-header">
          <div class="course-name">${course.name}</div>
          <span class="status-badge ${course.status}">${statusLabel}</span>
        </div>
        <div class="course-platform">${course.platform}</div>
        <div class="course-desc">${course.description}</div>
        <div class="course-meta">
          <span>${totalHours}h logged</span>
          <span>${logs.length} session${logs.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="course-actions-row" onclick="event.stopPropagation()">
          <div class="course-status-actions">
            <button class="status-btn ${course.status === 'not_started' ? 'active' : ''}" onclick="setCourseStatus('${course.id}', 'not_started')">Not Started</button>
            <button class="status-btn ${course.status === 'in_progress' ? 'active' : ''}" onclick="setCourseStatus('${course.id}', 'in_progress')">In Progress</button>
            <button class="status-btn ${course.status === 'completed' ? 'active' : ''}" onclick="setCourseStatus('${course.id}', 'completed')">Done ✓</button>
          </div>
          ${COURSE_URLS[course.name] ? `<a href="${COURSE_URLS[course.name]}" target="_blank" rel="noopener" class="course-link-btn">Go to course →</a>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function setCourseStatus(courseId, status) {
  await db.from('courses').update({ status }).eq('id', courseId);
  const course = state.courses.find(c => c.id === courseId);
  if (course) course.status = status;
  renderCourseGrid();
  renderAIStats();
}

function openCourseLogs(courseId) {
  const course = state.courses.find(c => c.id === courseId);
  if (!course) return;
  const logs = state.studyLogs.filter(l => l.course_id === courseId);
  const totalMin = logs.reduce((s, l) => s + (l.duration_minutes || 0), 0);

  document.getElementById('course-logs-title').textContent = course.name;
  const list = document.getElementById('course-logs-list');

  if (!logs.length) {
    list.innerHTML = '<div class="no-logs">No study sessions logged yet.<br>Hit "+ Log Study" to add one.</div>';
  } else {
    const totalHours = (totalMin / 60).toFixed(1);
    list.innerHTML = `
      <p style="margin-bottom:14px;font-size:0.85rem;color:var(--text-dim)">Total: <strong style="color:var(--ai-light)">${totalHours}h</strong> across ${logs.length} session${logs.length !== 1 ? 's' : ''}</p>
      ${logs.map(l => `
        <div class="log-entry">
          <div class="log-entry-left">
            <div class="log-entry-date">${formatDateDisplay(l.date)}</div>
            ${l.notes ? `<div class="log-entry-notes">${l.notes}</div>` : ''}
          </div>
          <div class="log-entry-duration">${l.duration_minutes}m</div>
        </div>
      `).join('')}
    `;
  }

  openModal('course-logs-modal');
}

function openLogStudyModal() {
  const select = document.getElementById('study-course-select');
  select.innerHTML = state.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('study-date').value = todayStr();
  document.getElementById('study-duration').value = '';
  document.getElementById('study-notes').value = '';
  openModal('log-study-modal');
}

async function saveStudyLog() {
  const courseId = document.getElementById('study-course-select').value;
  const duration = parseInt(document.getElementById('study-duration').value) || 0;
  const date = document.getElementById('study-date').value;
  const notes = document.getElementById('study-notes').value.trim();

  if (!courseId || !duration || !date) { showToast('Please fill in course, duration and date', 'error'); return; }

  const { data, error } = await db.from('study_logs').insert({ course_id: courseId, duration_minutes: duration, date, notes }).select().single();
  if (error) { showToast('Failed to save', 'error'); return; }

  state.studyLogs.unshift(data);
  closeModal();
  renderAI();

  // Auto-tick "Studied AI today" habit
  if (date === todayStr()) await autoTickHabit('study');
  showToast('Study session logged!');
}

// ==========================================
// FITNESS SECTION
// ==========================================

function renderFitness() {
  const dateInput = document.getElementById('entry-date');
  if (!dateInput.value) dateInput.value = todayStr();
  prefillEntryForDate(dateInput.value);
  renderFitnessStats();
  renderCutPlanner();
  renderWeightChart();
  renderTDEEInfo();
}

function prefillEntryForDate(date) {
  const w = state.weightLogs.find(l => l.date === date);
  const n = state.nutritionLogs.find(l => l.date === date);
  document.getElementById('entry-weight').value = w ? w.weight : '';
  document.getElementById('entry-calories').value = n ? n.calories : '';
  document.getElementById('entry-protein').value = n ? n.protein : '';
  document.getElementById('entry-carbs').value = n ? n.carbs : '';
  document.getElementById('entry-fat').value = n ? n.fat : '';
  const btn = document.getElementById('entry-save-btn');
  if (btn) btn.textContent = date === todayStr() ? 'Save Today\'s Entry' : `Save Entry for ${formatDateDisplay(date)}`;
}

function renderFitnessStats() {
  const latest = state.weightLogs.length ? state.weightLogs[state.weightLogs.length - 1] : null;
  const wow = getWeekOverWeekWeight();
  const wowHtml = wow
    ? `<div class="stat-wow" style="color:${parseFloat(wow.delta) < 0 ? 'var(--success)' : parseFloat(wow.delta) > 0 ? 'var(--fitness)' : 'var(--text-dim)'}">${parseFloat(wow.delta) > 0 ? '+' : ''}${wow.delta} kg vs last wk</div>`
    : '';
  document.getElementById('current-weight').innerHTML = (latest ? latest.weight + ' kg' : '—') + wowHtml;

  const { tdee, confidence, dataPoints } = calculateAdaptiveTDEE();
  if (tdee) {
    document.getElementById('tdee-display').textContent = tdee + ' kcal';
    const badge = document.getElementById('confidence-badge');
    const labels = { low: 'Low', medium: 'Medium', good: 'Good', high: 'High' };
    badge.textContent = labels[confidence] || confidence;
    badge.className = `confidence-badge ${confidence}`;
  } else {
    document.getElementById('tdee-display').textContent = '— kcal';
    document.getElementById('confidence-badge').textContent = '';
  }

  const deficit = state.selectedDeficit;
  document.getElementById('deficit-display').textContent = tdee ? `-${deficit} kcal` : '—';
  document.getElementById('target-cals').textContent = tdee ? (tdee - deficit) + ' kcal' : '—';
}

function renderCutPlanner() {
  // Goal weight
  const goalWeight = getSetting('goal_weight', '76');
  document.getElementById('goal-weight').value = goalWeight;

  // Deficit buttons — highlight preset if it matches, otherwise none
  document.querySelectorAll('.deficit-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.deficit) === state.selectedDeficit);
  });
  const customInput = document.getElementById('custom-deficit-input');
  if (customInput) customInput.value = state.selectedDeficit;

  // Projection
  const proj = getCutProjection();
  const projDiv = document.getElementById('cut-projection');
  const progressDiv = document.getElementById('progress-section');

  if (!proj) {
    projDiv.innerHTML = `<p style="font-size:0.85rem;color:var(--text-muted);text-align:center;">Log weight and calories for at least 3 days to see your projection.</p>`;
    progressDiv.innerHTML = '';
    return;
  }

  if (proj.done) {
    projDiv.innerHTML = `<p style="color:var(--success);text-align:center;font-weight:600;">🎉 Goal weight reached! You're at ${proj.latestWeight} kg.</p>`;
    progressDiv.innerHTML = '';
    return;
  }

  projDiv.innerHTML = `
    <div class="cut-projection-grid">
      <div class="proj-item">
        <div class="proj-value">${proj.tolose} kg</div>
        <div class="proj-label">To Lose</div>
      </div>
      <div class="proj-item">
        <div class="proj-value">${proj.weeklyLoss} kg</div>
        <div class="proj-label">Per Week</div>
      </div>
      <div class="proj-item">
        <div class="proj-value">${proj.daysToGoal}d</div>
        <div class="proj-label">Days Left</div>
      </div>
    </div>
    <div class="proj-note">Estimated completion: <strong style="color:var(--fitness-light)">${formatDateFull(proj.endDate)}</strong> · Target: ${proj.targetCals} kcal/day</div>
  `;

  // Progress bar
  const startWeight = state.weightLogs.length > 0 ? parseFloat(state.weightLogs[0].weight) : proj.latestWeight;
  const goal = parseFloat(getSetting('goal_weight', '76'));
  const totalToLose = startWeight - goal;
  const lost = startWeight - proj.latestWeight;
  const pct = totalToLose > 0 ? Math.min(100, Math.max(0, (lost / totalToLose) * 100)).toFixed(1) : 0;

  progressDiv.innerHTML = `
    <div class="progress-label-row">
      <span>${startWeight} kg → ${goal} kg</span>
      <span style="color:var(--success)">${pct}% complete</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>
    <div class="progress-label-row">
      <span>Lost: ${Math.max(0, lost).toFixed(1)} kg</span>
      <span>Remaining: ${Math.max(0, proj.tolose)} kg</span>
    </div>
  `;
}

function renderTDEEInfo() {
  const card = document.getElementById('tdee-info-card');
  const { tdee, confidence, dataPoints } = calculateAdaptiveTDEE();
  if (!tdee) {
    card.innerHTML = `<strong>Adaptive TDEE</strong><br>Your estimated maintenance calories will appear here once you have at least 3 days of paired weight + calorie data. The more data, the more accurate it gets.`;
    return;
  }
  const confidenceDesc = { low: 'Early estimate — keep logging', medium: 'Getting there — needs more data', good: 'Pretty solid — improving with each day', high: 'Highly accurate' }[confidence];
  card.innerHTML = `<strong>Adaptive TDEE</strong> — Based on <strong style="color:var(--fitness-light)">${dataPoints} days</strong> of data. Accuracy: ${confidenceDesc}. The algorithm back-calculates your real maintenance from actual weight change vs. logged calories — no formulas, just your real numbers.`;
}

async function saveEntry() {
  const entryDate = document.getElementById('entry-date').value || todayStr();
  const weight = parseFloat(document.getElementById('entry-weight').value);
  const calories = parseInt(document.getElementById('entry-calories').value);
  const protein = parseFloat(document.getElementById('entry-protein').value) || 0;
  const carbs = parseFloat(document.getElementById('entry-carbs').value) || 0;
  const fat = parseFloat(document.getElementById('entry-fat').value) || 0;

  if (!weight && !calories) { showToast('Enter at least weight or calories', 'error'); return; }

  const promises = [];

  if (weight) {
    promises.push(
      db.from('weight_logs').upsert({ date: entryDate, weight }, { onConflict: 'date' }).select().single()
        .then(({ data }) => {
          const idx = state.weightLogs.findIndex(l => l.date === entryDate);
          if (idx >= 0) state.weightLogs[idx] = data;
          else { state.weightLogs.push(data); state.weightLogs.sort((a, b) => a.date.localeCompare(b.date)); }
        })
    );
  }

  if (calories) {
    promises.push(
      db.from('nutrition_logs').upsert({ date: entryDate, calories, protein, carbs, fat }, { onConflict: 'date' }).select().single()
        .then(({ data }) => {
          const idx = state.nutritionLogs.findIndex(l => l.date === entryDate);
          if (idx >= 0) state.nutritionLogs[idx] = data;
          else { state.nutritionLogs.push(data); state.nutritionLogs.sort((a, b) => a.date.localeCompare(b.date)); }
        })
    );
  }

  await Promise.all(promises);

  // Auto-tick habits only for today's entry
  if (entryDate === todayStr()) {
    if (weight) await autoTickHabit('weight');
    if (calories) await autoTickHabit('calories');
  }

  renderFitness();
  const label = entryDate === todayStr() ? 'Today\'s entry saved!' : `Entry for ${formatDateDisplay(entryDate)} saved!`;
  showToast(label);
}

async function setCustomDeficit() {
  const val = parseInt(document.getElementById('custom-deficit-input').value);
  if (!val || val < 50 || val > 2500) { showToast('Enter a deficit between 50–2500 kcal', 'error'); return; }
  await selectDeficit(val);
}

async function saveGoalWeight() {
  const val = parseFloat(document.getElementById('goal-weight').value);
  if (!val || val < 40 || val > 200) { showToast('Enter a valid goal weight', 'error'); return; }
  await saveSetting('goal_weight', val);
  renderCutPlanner();
  renderFitnessStats();
  showToast('Goal weight updated!');
}

async function selectDeficit(deficit) {
  state.selectedDeficit = deficit;
  await saveSetting('selected_deficit', deficit);
  renderCutPlanner();
  renderFitnessStats();
}

// ==========================================
// WEIGHT CHART
// ==========================================

function renderWeightChart() {
  const range = document.getElementById('chart-range').value;
  let data = [...state.weightLogs];

  if (range !== 'all') {
    const cutoff = addDays(todayStr(), -parseInt(range));
    data = data.filter(d => d.date >= cutoff);
  }

  if (!data.length) {
    if (weightChart) { weightChart.destroy(); weightChart = null; }
    return;
  }

  const goalWeight = parseFloat(getSetting('goal_weight', '76'));
  const labels = data.map(d => formatDateDisplay(d.date));
  const weights = data.map(d => parseFloat(d.weight));

  const rollingAvg = weights.map((_, i) => {
    const slice = weights.slice(Math.max(0, i - 6), i + 1);
    return parseFloat((slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(2));
  });

  const goalLine = Array(data.length).fill(goalWeight);

  const ctx = document.getElementById('weight-chart').getContext('2d');

  if (weightChart) {
    weightChart.data.labels = labels;
    weightChart.data.datasets[0].data = weights;
    weightChart.data.datasets[1].data = rollingAvg;
    weightChart.data.datasets[2].data = goalLine;
    weightChart.update();
    return;
  }

  weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Weight',
          data: weights,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,0.08)',
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 1.5,
          tension: 0.2,
          fill: false,
        },
        {
          label: '7-day avg',
          data: rollingAvg,
          borderColor: '#22c55e',
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.4,
          fill: false,
        },
        {
          label: 'Goal',
          data: goalLine,
          borderColor: '#8b5cf6',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 12 }, boxWidth: 20 } },
        tooltip: {
          backgroundColor: '#1e2538',
          borderColor: '#2d3650',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} kg` },
        },
      },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 11 } }, grid: { color: '#1e2538' } },
        y: { ticks: { color: '#64748b', font: { size: 11 }, callback: v => v + ' kg' }, grid: { color: '#1e2538' } },
      },
    },
  });
}

function updateChart() {
  if (weightChart) { weightChart.destroy(); weightChart = null; }
  renderWeightChart();
}

// ==========================================
// HABITS SECTION
// ==========================================

function renderHabits() {
  const weekDates = getWeekDates(state.currentWeekOffset);
  renderHabitDayHeaders(weekDates);
  renderHabitRows(weekDates);
  renderHabitsManageList();
  renderWeekLabel(weekDates);
  renderHabitsStats(weekDates);
  renderMonthlyOverview();

  const nextBtn = document.getElementById('week-next-btn');
  nextBtn.disabled = state.currentWeekOffset >= 0;
  nextBtn.style.opacity = state.currentWeekOffset >= 0 ? '0.4' : '1';
}

function renderWeekLabel(weekDates) {
  const start = formatDateDisplay(weekDates[0]);
  const end = formatDateDisplay(weekDates[6]);
  const isCurrentWeek = state.currentWeekOffset === 0;
  document.getElementById('week-label').textContent = isCurrentWeek ? `This Week (${start} – ${end})` : `${start} – ${end}`;
}

function renderHabitDayHeaders(weekDates) {
  const today = todayStr();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  document.getElementById('habit-day-headers').innerHTML = weekDates.map((d, i) => {
    const isToday = d === today;
    const dayNum = new Date(d + 'T00:00:00').getDate();
    return `<div class="day-header ${isToday ? 'today' : ''}">${dayNames[i]}<br>${dayNum}</div>`;
  }).join('');
}

function renderHabitRows(weekDates) {
  const today = todayStr();
  const container = document.getElementById('habit-rows');
  if (!state.habits.length) {
    container.innerHTML = '<div class="loading-state">No habits yet. Add some below!</div>';
    return;
  }

  container.innerHTML = state.habits.map(habit => {
    const checks = weekDates.map(date => {
      const log = state.habitLogs.find(l => l.habit_id === habit.id && l.date === date);
      const isChecked = log ? log.completed : false;
      const isFuture = date > today;
      const isToday = date === today;
      let classes = 'check-btn';
      if (isChecked) classes += ' checked';
      if (isFuture) classes += ' future';
      if (isToday) classes += ' today-col';
      const clickHandler = isFuture ? '' : `onclick="toggleHabit('${habit.id}','${date}',${isChecked})"`;
      // For timed habits: show logged minutes as overlay
      const minutesLogged = log?.minutes;
      const timeOverlay = minutesLogged ? `<span class="time-overlay">${minutesLogged}m</span>` : '';
      return `<div class="habit-check" style="position:relative">
        <button class="${classes}" ${clickHandler} title="${date}"></button>${timeOverlay}
      </div>`;
    }).join('');

    const autoBadge = habit.auto_type ? `<span class="auto-badge">auto</span>` : '';
    const streak = getHabitStreak(habit.id);
    const streakBadge = streak > 1 ? `<span class="streak-badge">🔥${streak}</span>` : '';
    // Timed habit button (only for today)
    const timedBtn = habit.time_goal_minutes
      ? `<button class="time-log-btn" onclick="openLogHabitTimeModal('${habit.id}','${today}')" title="Log time">⏱</button>`
      : '';
    const timeGoalLabel = habit.time_goal_minutes
      ? `<span class="time-goal-label">${habit.time_goal_type === 'max' ? 'max ' : ''}${habit.time_goal_minutes}m</span>`
      : '';

    return `
      <div class="habit-row">
        <div class="habit-row-name">
          <span class="habit-name-text">${habit.name}</span>
          ${autoBadge}${streakBadge}${timeGoalLabel}${timedBtn}
        </div>
        <div class="habit-checks">${checks}</div>
      </div>
    `;
  }).join('');
}

function renderHabitsManageList() {
  const list = document.getElementById('habits-manage-list');
  list.innerHTML = state.habits.map(habit => {
    const streak = getHabitStreak(habit.id);
    const timeGoalText = habit.time_goal_minutes
      ? `${habit.time_goal_type === 'max' ? 'max ' : 'min '}${habit.time_goal_minutes}m`
      : 'No goal';
    return `
    <div class="habit-manage-row">
      <div class="habit-manage-name">
        <span>${habit.name}</span>
        ${habit.auto_type ? `<span class="auto-badge" style="background:var(--habits-dim);color:var(--habits-light);font-size:0.7rem;padding:1px 6px;border-radius:20px">auto</span>` : ''}
        ${streak > 0 ? `<span class="streak-badge">🔥${streak}</span>` : ''}
      </div>
      <div class="manage-row-actions">
        <button class="btn-secondary btn-sm" onclick="openSetTimeGoalModal('${habit.id}')">⏱ ${timeGoalText}</button>
        ${!habit.auto_type ? `<button class="btn-danger btn-sm" onclick="deleteHabit('${habit.id}')">Remove</button>` : ''}
      </div>
    </div>
  `}).join('');
}

async function toggleHabit(habitId, date, currentlyChecked) {
  const newVal = !currentlyChecked;
  const existing = state.habitLogs.find(l => l.habit_id === habitId && l.date === date);

  if (existing) {
    await db.from('habit_logs').update({ completed: newVal }).eq('id', existing.id);
    existing.completed = newVal;
  } else {
    const { data } = await db.from('habit_logs').insert({ habit_id: habitId, date, completed: newVal }).select().single();
    if (data) state.habitLogs.push(data);
  }

  renderHabitRows(getWeekDates(state.currentWeekOffset));
}

async function autoTickHabit(autoType) {
  const habit = state.habits.find(h => h.auto_type === autoType);
  if (!habit) return;
  const today = todayStr();
  const existing = state.habitLogs.find(l => l.habit_id === habit.id && l.date === today);
  if (existing && existing.completed) return;

  if (existing) {
    await db.from('habit_logs').update({ completed: true }).eq('id', existing.id);
    existing.completed = true;
  } else {
    const { data } = await db.from('habit_logs').insert({ habit_id: habit.id, date: today, completed: true }).select().single();
    if (data) state.habitLogs.push(data);
  }

  if (document.getElementById('habits-section') && !document.getElementById('habits-section').classList.contains('hidden')) {
    renderHabitRows(getWeekDates(state.currentWeekOffset));
  }
}

function renderHabitsStats(weekDates) {
  const today = todayStr();
  const pastDates = weekDates.filter(d => d <= today);
  const totalPossible = state.habits.length * pastDates.length;
  const completed = pastDates.reduce((sum, date) => {
    return sum + state.habits.filter(habit => {
      const log = state.habitLogs.find(l => l.habit_id === habit.id && l.date === date);
      return log && log.completed;
    }).length;
  }, 0);

  const pct = totalPossible > 0 ? Math.round((completed / totalPossible) * 100) : 0;
  const color = totalPossible === 0 ? 'var(--text-muted)' : pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
  const isCurrentWeek = state.currentWeekOffset === 0;

  const el = document.getElementById('habits-week-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="week-stats-content">
      <div>
        <span class="week-stats-label">${isCurrentWeek ? 'This Week' : 'Week'}</span>
        <span class="week-stats-pct" style="color:${color}">${totalPossible > 0 ? pct + '%' : '—'}</span>
      </div>
      <div class="week-stats-detail">${completed} / ${totalPossible} habit-days completed</div>
    </div>
    <div class="week-stats-bar-bg">
      <div class="week-stats-bar-fill" style="width:${pct}%;background:${color}"></div>
    </div>
  `;
}

function getWeekCompletionStats(weekDates) {
  const today = todayStr();
  const pastDates = weekDates.filter(d => d <= today);
  if (pastDates.length === 0) return null;
  const totalPossible = state.habits.length * pastDates.length;
  const completed = pastDates.reduce((sum, date) => {
    return sum + state.habits.filter(habit => {
      const log = state.habitLogs.find(l => l.habit_id === habit.id && l.date === date);
      return log && log.completed;
    }).length;
  }, 0);
  return totalPossible > 0 ? Math.round((completed / totalPossible) * 100) : 0;
}

function renderMonthlyOverview() {
  const container = document.getElementById('monthly-overview');
  if (!container) return;

  const refDate = new Date();
  refDate.setDate(1);
  refDate.setMonth(refDate.getMonth() + state.currentMonthOffset);

  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const monthName = refDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Find first Monday on or before month start
  const startDow = (firstDay.getDay() + 6) % 7;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() - startDow);

  const weeks = [];
  let ws = new Date(firstMonday);

  while (ws <= lastDay) {
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);

    // Only dates within this month
    const weekDates = [];
    const cur = new Date(ws);
    while (cur <= we) {
      if (cur.getMonth() === month) weekDates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }

    const pct = getWeekCompletionStats(weekDates);
    const isFuture = pct === null;

    weeks.push({
      displayStart: formatDateDisplay(weekDates[0]),
      displayEnd: formatDateDisplay(weekDates[weekDates.length - 1]),
      pct,
      isFuture,
    });

    ws.setDate(ws.getDate() + 7);
  }

  const isCurrentMonth = state.currentMonthOffset === 0;

  container.innerHTML = `
    <div class="monthly-nav">
      <button class="btn-ghost btn-sm" onclick="navigateMonth(-1)">← Prev</button>
      <span class="month-label">${monthName}</span>
      <button class="btn-ghost btn-sm" onclick="navigateMonth(1)" ${isCurrentMonth ? 'disabled style="opacity:0.4"' : ''}>Next →</button>
    </div>
    <div class="monthly-weeks">
      ${weeks.map((week, i) => {
        const color = week.isFuture ? 'var(--text-muted)' : week.pct >= 80 ? 'var(--success)' : week.pct >= 50 ? 'var(--warning)' : 'var(--danger)';
        return `
          <div class="month-week-row">
            <div class="month-week-label">
              <span class="week-num">Wk ${i + 1}</span>
              <span class="week-dates">${week.displayStart} – ${week.displayEnd}</span>
            </div>
            <div class="month-week-bar-bg">
              ${!week.isFuture ? `<div class="month-week-bar-fill" style="width:${week.pct}%;background:${color}"></div>` : ''}
            </div>
            <div class="month-week-pct" style="color:${color}">${week.isFuture ? '—' : week.pct + '%'}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function navigateMonth(dir) {
  const newOffset = state.currentMonthOffset + dir;
  if (newOffset > 0) return;
  state.currentMonthOffset = newOffset;
  renderMonthlyOverview();
}

function navigateWeek(direction) {
  const newOffset = state.currentWeekOffset + direction;
  if (newOffset > 0) return;
  state.currentWeekOffset = newOffset;
  renderHabits();
}

function openAddHabitModal() {
  document.getElementById('new-habit-name').value = '';
  openModal('add-habit-modal');
}

async function saveNewHabit() {
  const name = document.getElementById('new-habit-name').value.trim();
  if (!name) { showToast('Enter a habit name', 'error'); return; }

  const order = state.habits.length;
  const { data, error } = await db.from('habits').insert({ name, auto_type: null, order_index: order }).select().single();
  if (error || !data) { showToast('Failed to add habit', 'error'); return; }

  state.habits.push(data);
  closeModal();
  renderHabits();
  showToast('Habit added!');
}

async function deleteHabit(habitId) {
  if (!confirm('Remove this habit and all its history?')) return;
  await db.from('habit_logs').delete().eq('habit_id', habitId);
  await db.from('habits').delete().eq('id', habitId);
  state.habits = state.habits.filter(h => h.id !== habitId);
  state.habitLogs = state.habitLogs.filter(l => l.habit_id !== habitId);
  renderHabits();
  showToast('Habit removed');
}

// ==========================================
// MODALS
// ==========================================

function openModal(modalId) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ==========================================
// COURSE URL MAP
// ==========================================

const COURSE_URLS = {
  'Elements of AI': 'https://course.elementsofai.com',
  'AI for Everyone': 'https://www.coursera.org/learn/ai-for-everyone',
  'AI Safety Fundamentals — Alignment Track': 'https://aisafetyfundamentals.com/alignment',
  'Google ML Crash Course': 'https://developers.google.com/machine-learning/crash-course',
  'fast.ai Part 1 (Lessons 1–3)': 'https://course.fast.ai',
  'AI Safety Fundamentals — Governance Track': 'https://aisafetyfundamentals.com/governance',
  'Responsible AI': 'https://www.edx.org/learn/artificial-intelligence/the-alan-turing-institute-ethics-of-ai',
  'AI Ethics': 'https://www.edx.org/learn/ethics/university-of-helsinki-ethics-of-ai',
};

// ==========================================
// STUDY TIMER
// ==========================================

const timer = {
  courseId: null,
  startTime: null,
  elapsed: 0,
  running: false,
  intervalId: null,
};

function timerGetElapsed() {
  return timer.elapsed + (timer.running ? Math.floor((Date.now() - timer.startTime) / 1000) : 0);
}

function timerFormat(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function toggleTimer() {
  const courseId = document.getElementById('timer-course-select').value;
  if (!courseId) { showToast('Select a course first', 'error'); return; }

  if (timer.running) {
    timer.elapsed += Math.floor((Date.now() - timer.startTime) / 1000);
    timer.startTime = null;
    timer.running = false;
    clearInterval(timer.intervalId);
    document.getElementById('timer-start-btn').textContent = '▶ Resume';
    document.getElementById('timer-status').textContent = 'Paused';
  } else {
    timer.courseId = courseId;
    timer.startTime = Date.now();
    timer.running = true;
    timer.intervalId = setInterval(() => {
      document.getElementById('timer-display').textContent = timerFormat(timerGetElapsed());
    }, 1000);
    document.getElementById('timer-start-btn').textContent = '⏸ Pause';
    document.getElementById('timer-stop-btn').disabled = false;
    const course = state.courses.find(c => c.id === courseId);
    document.getElementById('timer-status').textContent = course ? `Studying: ${course.name}` : 'Running…';
  }
}

function stopAndLogTimer() {
  if (timer.running) {
    timer.elapsed += Math.floor((Date.now() - timer.startTime) / 1000);
    timer.startTime = null;
    timer.running = false;
    clearInterval(timer.intervalId);
  }
  const minutes = Math.round(timer.elapsed / 60);
  if (minutes < 1) { showToast('Log at least 1 minute', 'error'); resetTimer(); return; }

  const select = document.getElementById('study-course-select');
  select.innerHTML = state.courses.map(c =>
    `<option value="${c.id}" ${c.id === timer.courseId ? 'selected' : ''}>${c.name}</option>`
  ).join('');
  document.getElementById('study-duration').value = minutes;
  document.getElementById('study-date').value = todayStr();
  document.getElementById('study-notes').value = '';

  resetTimer();
  openModal('log-study-modal');
}

function resetTimer() {
  clearInterval(timer.intervalId);
  timer.elapsed = 0;
  timer.startTime = null;
  timer.running = false;
  timer.courseId = null;
  const el = document.getElementById('timer-display');
  if (el) el.textContent = '0:00';
  const btn = document.getElementById('timer-start-btn');
  if (btn) btn.textContent = '▶ Start';
  const stopBtn = document.getElementById('timer-stop-btn');
  if (stopBtn) stopBtn.disabled = true;
  const status = document.getElementById('timer-status');
  if (status) status.textContent = 'Ready to study';
}

function initTimerCourseSelect() {
  const select = document.getElementById('timer-course-select');
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '<option value="">Select course…</option>' +
    state.courses.map(c => `<option value="${c.id}" ${c.id === prev ? 'selected' : ''}>${c.name}</option>`).join('');
}

// ==========================================
// HOME / WEEKLY DIGEST
// ==========================================

function renderHome() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('home-greeting').textContent = greeting;
  document.getElementById('home-date').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const today = new Date();
  const daysToExam = Math.ceil((PHASE_DATE - today) / 86400000);
  const miniEl = document.getElementById('home-phase-mini');
  if (miniEl) {
    if (today < PHASE_DATE) {
      miniEl.innerHTML = `<span class="phase-mini grind-mini">${daysToExam}d to phase flip</span>`;
    } else {
      miniEl.innerHTML = `<span class="phase-mini hunt-mini">Job Hunt Mode</span>`;
    }
  }

  renderTodayDigest();
  renderWeekDigest();
}

function renderTodayDigest() {
  const today = todayStr();
  const studyMin = state.studyLogs.filter(l => l.date === today).reduce((s, l) => s + (l.duration_minutes || 0), 0);
  const todayWeight = state.weightLogs.find(l => l.date === today);
  const todayNutrition = state.nutritionLogs.find(l => l.date === today);
  const habitsDoneToday = state.habits.filter(h => {
    const log = state.habitLogs.find(l => l.habit_id === h.id && l.date === today);
    return log && log.completed;
  }).length;

  const { tdee } = calculateAdaptiveTDEE();
  const target = tdee ? tdee - state.selectedDeficit : null;
  const calColor = todayNutrition && target
    ? (Math.abs(todayNutrition.calories - target) < 150 ? 'var(--success)' : todayNutrition.calories > target + 150 ? 'var(--fitness)' : 'var(--text)')
    : 'var(--text)';

  const el = document.getElementById('today-digest');
  if (!el) return;
  el.innerHTML = `
    <div class="today-stat">
      <div class="today-stat-icon">🧠</div>
      <div class="today-stat-value">${studyMin >= 60 ? (studyMin/60).toFixed(1)+'h' : studyMin+'m'}</div>
      <div class="today-stat-label">Study</div>
    </div>
    <div class="today-stat">
      <div class="today-stat-icon">⚖️</div>
      <div class="today-stat-value">${todayWeight ? todayWeight.weight+' kg' : '—'}</div>
      <div class="today-stat-label">Weight</div>
    </div>
    <div class="today-stat">
      <div class="today-stat-icon">🍽️</div>
      <div class="today-stat-value" style="color:${calColor}">${todayNutrition ? todayNutrition.calories+' kcal' : '—'}</div>
      <div class="today-stat-label">${target ? 'Target: '+target : 'Calories'}</div>
    </div>
    <div class="today-stat">
      <div class="today-stat-icon">✅</div>
      <div class="today-stat-value">${habitsDoneToday}/${state.habits.length}</div>
      <div class="today-stat-label">Habits</div>
    </div>
  `;
}

function getWeekOverWeekWeight() {
  if (state.weightLogs.length < 2) return null;
  const today = todayStr();
  const dow = (new Date().getDay() + 6) % 7;
  const thisWeekStart = addDays(today, -dow);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const lastWeekEnd = addDays(thisWeekStart, -1);

  const thisLogs = state.weightLogs.filter(l => l.date >= thisWeekStart && l.date <= today);
  const lastLogs = state.weightLogs.filter(l => l.date >= lastWeekStart && l.date <= lastWeekEnd);
  if (!thisLogs.length || !lastLogs.length) return null;

  const thisAvg = thisLogs.reduce((s, l) => s + parseFloat(l.weight), 0) / thisLogs.length;
  const lastAvg = lastLogs.reduce((s, l) => s + parseFloat(l.weight), 0) / lastLogs.length;
  const delta = thisAvg - lastAvg;
  return { thisAvg: thisAvg.toFixed(2), lastAvg: lastAvg.toFixed(2), delta: delta.toFixed(2) };
}

function renderWeekDigest() {
  const el = document.getElementById('week-digest');
  if (!el) return;

  const weekDates = getWeekDates(0);
  const today = todayStr();
  const pastDates = weekDates.filter(d => d <= today);

  const weekStudyMin = state.studyLogs.filter(l => weekDates.includes(l.date)).reduce((s, l) => s + (l.duration_minutes || 0), 0);
  const wow = getWeekOverWeekWeight();
  const weekNutrition = state.nutritionLogs.filter(l => pastDates.includes(l.date));
  const avgCals = weekNutrition.length ? Math.round(weekNutrition.reduce((s, l) => s + l.calories, 0) / weekNutrition.length) : null;
  const { tdee } = calculateAdaptiveTDEE();
  const target = tdee ? tdee - state.selectedDeficit : null;

  const habitTotal = state.habits.length * pastDates.length;
  const habitDone = pastDates.reduce((sum, d) => sum + state.habits.filter(h => {
    const log = state.habitLogs.find(l => l.habit_id === h.id && l.date === d);
    return log && log.completed;
  }).length, 0);
  const habitPct = habitTotal > 0 ? Math.round((habitDone / habitTotal) * 100) : 0;

  const wowDelta = wow ? parseFloat(wow.delta) : 0;
  const wowColor = wow ? (wowDelta < 0 ? 'var(--success)' : wowDelta > 0 ? 'var(--fitness)' : 'var(--text-dim)') : 'var(--text-dim)';
  const wowArrow = wow ? (wowDelta < 0 ? '↓' : wowDelta > 0 ? '↑' : '→') : '';
  const calColor = avgCals && target ? (Math.abs(avgCals - target) < 150 ? 'var(--success)' : avgCals > target + 150 ? 'var(--fitness)' : 'var(--text)') : 'var(--text)';
  const habitColor = habitPct >= 80 ? 'var(--success)' : habitPct >= 50 ? 'var(--warning)' : habitTotal > 0 ? 'var(--danger)' : 'var(--text-muted)';

  el.innerHTML = `
    <div class="week-digest-card card">
      <div class="digest-icon">🧠</div>
      <div class="digest-value">${weekStudyMin >= 60 ? (weekStudyMin/60).toFixed(1)+'h' : weekStudyMin+'m'}</div>
      <div class="digest-label-text">Study this week</div>
    </div>
    <div class="week-digest-card card">
      <div class="digest-icon">⚖️</div>
      <div class="digest-value" style="color:${wowColor}">${wow ? wow.thisAvg+' kg' : '—'}</div>
      <div class="digest-label-text">${wow ? wowArrow+' '+Math.abs(wow.delta)+' kg vs last week' : 'No comparison yet'}</div>
    </div>
    <div class="week-digest-card card">
      <div class="digest-icon">🍽️</div>
      <div class="digest-value" style="color:${calColor}">${avgCals ? avgCals+' kcal' : '—'}</div>
      <div class="digest-label-text">${target ? 'Target: '+target+' kcal' : 'Avg calories'}</div>
    </div>
    <div class="week-digest-card card">
      <div class="digest-icon">✅</div>
      <div class="digest-value" style="color:${habitColor}">${habitTotal > 0 ? habitPct+'%' : '—'}</div>
      <div class="digest-label-text">Habit completion</div>
    </div>
  `;
}

// ==========================================
// HABIT STREAKS
// ==========================================

function getHabitStreak(habitId) {
  const today = todayStr();
  const todayDow = new Date(today + 'T00:00:00').getDay();
  // Skip back to last weekday if today is weekend
  let startDay = today;
  if (todayDow === 6) startDay = addDays(today, -1);      // Sat → Fri
  else if (todayDow === 0) startDay = addDays(today, -2); // Sun → Fri
  const startLog = state.habitLogs.find(l => l.habit_id === habitId && l.date === startDay);
  let d = (startLog && startLog.completed) ? startDay : addDays(startDay, -1);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const dow = new Date(d + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6) { d = addDays(d, -1); continue; } // skip weekends
    const log = state.habitLogs.find(l => l.habit_id === habitId && l.date === d);
    if (log && log.completed) { streak++; d = addDays(d, -1); }
    else break;
  }
  return streak;
}

// ==========================================
// TIMED HABITS
// ==========================================

let _timeGoalHabitId = null;

function openSetTimeGoalModal(habitId) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit) return;
  _timeGoalHabitId = habitId;
  document.getElementById('time-goal-habit-name').textContent = habit.name;
  document.getElementById('time-goal-type').value = habit.time_goal_type || 'min';
  document.getElementById('time-goal-minutes').value = habit.time_goal_minutes || '';
  openModal('set-time-goal-modal');
}

async function saveHabitTimeGoal() {
  const type = document.getElementById('time-goal-type').value;
  const minutes = parseInt(document.getElementById('time-goal-minutes').value) || null;
  if (type !== 'none' && !minutes) { showToast('Enter a number of minutes', 'error'); return; }

  const update = type === 'none'
    ? { time_goal_minutes: null, time_goal_type: null }
    : { time_goal_minutes: minutes, time_goal_type: type };

  await db.from('habits').update(update).eq('id', _timeGoalHabitId);
  const habit = state.habits.find(h => h.id === _timeGoalHabitId);
  if (habit) Object.assign(habit, update);
  closeModal();
  renderHabits();
  showToast('Time goal saved!');
}

function openLogHabitTimeModal(habitId, date) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit) return;
  const existing = state.habitLogs.find(l => l.habit_id === habitId && l.date === date);
  document.getElementById('log-time-habit-name').textContent = `Log time — ${habit.name}`;
  document.getElementById('log-time-minutes').value = existing?.minutes || '';
  document.getElementById('log-time-habit-id').value = habitId;
  document.getElementById('log-time-date').value = date;

  let hint = '';
  if (habit.time_goal_minutes) {
    if (habit.time_goal_type === 'min') hint = `Goal: at least ${habit.time_goal_minutes} min. Hit the goal to auto-check.`;
    else if (habit.time_goal_type === 'max') hint = `Limit: max ${habit.time_goal_minutes} min.`;
  }
  document.getElementById('log-time-goal-hint').textContent = hint;
  openModal('log-habit-time-modal');
}

async function saveHabitTime() {
  const habitId = document.getElementById('log-time-habit-id').value;
  const date = document.getElementById('log-time-date').value;
  const minutes = parseInt(document.getElementById('log-time-minutes').value);
  if (!minutes || minutes < 1) { showToast('Enter a valid number of minutes', 'error'); return; }

  const habit = state.habits.find(h => h.id === habitId);
  const existing = state.habitLogs.find(l => l.habit_id === habitId && l.date === date);

  // Auto-check logic for 'min' type goals
  const shouldCheck = habit?.time_goal_type === 'min' && habit.time_goal_minutes && minutes >= habit.time_goal_minutes;
  const completed = shouldCheck ? true : (existing ? existing.completed : false);

  if (existing) {
    const { data } = await db.from('habit_logs').update({ minutes, completed }).eq('id', existing.id).select().single();
    if (data) Object.assign(existing, data);
  } else {
    const { data } = await db.from('habit_logs').insert({ habit_id: habitId, date, minutes, completed }).select().single();
    if (data) state.habitLogs.push(data);
  }

  closeModal();
  renderHabits();
  if (shouldCheck) showToast('Goal met — habit auto-checked! ✓');
  else showToast('Time logged!');
}

// ==========================================
// INIT
// ==========================================

(async function init() {
  const url = localStorage.getItem('sb_url');
  const key = localStorage.getItem('sb_key');
  if (url && key) {
    await launchApp(url, key);
  }
  // Setup SQL preview is already populated via the const
})();
