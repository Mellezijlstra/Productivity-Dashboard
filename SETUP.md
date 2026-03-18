# Dashboard Setup & Deployment

## What you need
- A free GitHub account (you have this)
- A free Supabase account (database)
- A free Vercel account (hosting)

---

## Step 1 — Supabase (Database)

1. Go to **supabase.com** → Sign up (free)
2. Click **New Project** → choose a name (e.g. "dashboard") → set a password → pick a region (Europe West is fine)
3. Wait ~1 min for it to spin up
4. Go to **SQL Editor** (left sidebar) → click **New Query**
5. Paste the SQL from the app's setup screen (or copy it from below) → click **Run**
6. Go to **Project Settings → API** (left sidebar)
7. Copy your **Project URL** and **anon public** key — you'll need these

---

## Step 2 — Local Preview (optional but recommended)

Before deploying, test it locally:

1. Open VS Code
2. Install the **Live Server** extension (search in Extensions panel)
3. Open this folder in VS Code
4. Right-click `index.html` → **Open with Live Server**
5. The app opens at `http://localhost:5500`
6. On first load, enter your Supabase URL + anon key → Connect

---

## Step 3 — Deploy to Vercel (free hosting, accessible on any device)

### 3a — Push to GitHub

1. Open VS Code terminal (Ctrl + `)
2. Run these commands one by one:
   ```
   git init
   git add .
   git commit -m "Initial dashboard"
   ```
3. Go to **github.com** → click **+** → **New repository**
4. Name it `productivity-dashboard` → leave it Public → **Create repository**
5. Copy the commands GitHub shows under "push an existing repository" and run them in VS Code terminal

### 3b — Deploy on Vercel

1. Go to **vercel.com** → Sign up with GitHub (free)
2. Click **Add New Project** → Import your `productivity-dashboard` repo
3. Leave all settings as default → click **Deploy**
4. Vercel gives you a URL like `https://productivity-dashboard-abc123.vercel.app`

That's your app — works on laptop, iPhone, anywhere.

---

## Step 4 — iPhone Home Screen

1. Open your Vercel URL in **Safari** on your iPhone
2. Tap the **Share** button (box with arrow) → **Add to Home Screen**
3. It installs as an app icon — tap it and it opens full screen like a native app

---

## Re-entering credentials on a new device

The app stores your Supabase URL and anon key in your browser's localStorage.
- First time on a new device: you'll see the setup screen — enter the same URL and key
- Data is all in Supabase so it syncs instantly

---

## Migration SQL — Timed Habits (run once to unlock timed habit features)

```sql
ALTER TABLE habits ADD COLUMN IF NOT EXISTS time_goal_minutes INTEGER;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS time_goal_type TEXT;
ALTER TABLE habit_logs ADD COLUMN IF NOT EXISTS minutes INTEGER;
```

Run this in the Supabase SQL Editor. Safe to run multiple times.

---

## Setup SQL (if needed outside the app)

```sql
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
ALTER TABLE habit_logs DISABLE ROW LEVEL SECURITY;
```
