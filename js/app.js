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

CREATE TABLE IF NOT EXISTS sauna_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  duration_minutes INTEGER NOT NULL,
  protocol TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- If you already ran the old version of this table, run this too:
ALTER TABLE sauna_logs ADD COLUMN IF NOT EXISTS protocol TEXT;

CREATE TABLE IF NOT EXISTS day_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  day_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE study_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE habits DISABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE sauna_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE day_logs DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'daily',
  date DATE NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS micro_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  food TEXT NOT NULL,
  grams DECIMAL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE micro_logs DISABLE ROW LEVEL SECURITY;
-- If you already ran the old version, add the grams column:
ALTER TABLE micro_logs ADD COLUMN IF NOT EXISTS grams DECIMAL DEFAULT 100;`;

let db = null;
let weightChart = null;

// ==========================================
// MICRO NUTRIENT DATA
// ==========================================

// per100g values: vitC(mg), vitA(µg), vitB6(mg), vitB12(µg), iron(mg), zinc(mg),
//   potassium(mg), calcium(mg), iodine(µg), magnesium(mg), vitD(µg), folate(µg),
//   vitK(µg), selenium(µg), copper(mg), manganese(mg), choline(mg), vitE(mg), omega3(mg)
const FOODS = [
  { id: 'avocado',       name: 'Avocado',        emoji: '🥑',
    per100g: { vitC:10,   vitA:7,   vitB6:0.26, vitB12:0,    iron:0.55, zinc:0.64,  potassium:485,  calcium:12,   iodine:1,   magnesium:29,  vitD:0,    folate:81,  vitK:21,    selenium:0.4,  copper:0.19, manganese:0.14, choline:14.2, vitE:2.07, omega3:110 }},
  { id: 'chicken',       name: 'Chicken',         emoji: '🍗',
    per100g: { vitC:0,    vitA:9,   vitB6:0.9,  vitB12:0.3,  iron:1.0,  zinc:1.8,   potassium:340,  calcium:15,   iodine:6,   magnesium:29,  vitD:0.1,  folate:4,   vitK:0,     selenium:27,   copper:0.07, manganese:0.02, choline:85,   vitE:0.3,  omega3:50  }},
  { id: 'kiwi',          name: 'Kiwi',            emoji: '🥝',
    per100g: { vitC:93,   vitA:4,   vitB6:0.06, vitB12:0,    iron:0.31, zinc:0.14,  potassium:312,  calcium:34,   iodine:0,   magnesium:17,  vitD:0,    folate:25,  vitK:40,    selenium:0.2,  copper:0.13, manganese:0.1,  choline:7.8,  vitE:1.5,  omega3:40  }},
  { id: 'apple',         name: 'Apple',           emoji: '🍎',
    per100g: { vitC:4.6,  vitA:3,   vitB6:0.04, vitB12:0,    iron:0.12, zinc:0.04,  potassium:107,  calcium:6,    iodine:0,   magnesium:5,   vitD:0,    folate:3,   vitK:2.2,   selenium:0,    copper:0.03, manganese:0.04, choline:3.4,  vitE:0.18, omega3:9   }},
  { id: 'carrot',        name: 'Carrot',          emoji: '🥕',
    per100g: { vitC:5.9,  vitA:835, vitB6:0.14, vitB12:0,    iron:0.3,  zinc:0.24,  potassium:320,  calcium:33,   iodine:2,   magnesium:12,  vitD:0,    folate:19,  vitK:13.2,  selenium:0.1,  copper:0.05, manganese:0.14, choline:8.8,  vitE:0.66, omega3:2   }},
  { id: 'rice',          name: 'Rice',            emoji: '🍚',
    per100g: { vitC:0,    vitA:0,   vitB6:0.08, vitB12:0,    iron:0.2,  zinc:0.49,  potassium:35,   calcium:10,   iodine:0,   magnesium:12,  vitD:0,    folate:3,   vitK:0,     selenium:7.5,  copper:0.07, manganese:0.47, choline:2.1,  vitE:0,    omega3:18  }},
  { id: 'sweetpotato',   name: 'Sweet Potato',    emoji: '🍠',
    per100g: { vitC:12.8, vitA:961, vitB6:0.3,  vitB12:0,    iron:0.74, zinc:0.32,  potassium:475,  calcium:38,   iodine:2,   magnesium:27,  vitD:0,    folate:6,   vitK:2.5,   selenium:0.6,  copper:0.16, manganese:0.26, choline:12.3, vitE:0.71, omega3:10  }},
  { id: 'pecorino',      name: 'Pecorino',        emoji: '🧀',
    per100g: { vitC:0,    vitA:150, vitB6:0.08, vitB12:1.5,  iron:0.5,  zinc:2.5,   potassium:90,   calcium:760,  iodine:30,  magnesium:20,  vitD:0.5,  folate:7,   vitK:2,     selenium:14,   copper:0.02, manganese:0.02, choline:15,   vitE:0.3,  omega3:130 }},
  { id: 'parmesan',      name: 'Parmesan',        emoji: '🧀',
    per100g: { vitC:0,    vitA:140, vitB6:0.09, vitB12:1.2,  iron:0.82, zinc:2.75,  potassium:92,   calcium:1184, iodine:30,  magnesium:44,  vitD:0.5,  folate:7,   vitK:1.7,   selenium:22,   copper:0.03, manganese:0.03, choline:15,   vitE:0.27, omega3:90  }},
  { id: 'eggs',          name: 'Eggs',            emoji: '🥚',
    per100g: { vitC:0,    vitA:149, vitB6:0.17, vitB12:1.11, iron:1.83, zinc:1.29,  potassium:138,  calcium:56,   iodine:53,  magnesium:12,  vitD:2.0,  folate:47,  vitK:0.3,   selenium:31.7, copper:0.13, manganese:0.04, choline:294,  vitE:1.03, omega3:100 }},
  { id: 'driedapricot',  name: 'Dried Apricot',   emoji: '🍑',
    per100g: { vitC:1,    vitA:180, vitB6:0.14, vitB12:0,    iron:2.66, zinc:0.39,  potassium:1160, calcium:55,   iodine:0,   magnesium:32,  vitD:0,    folate:13,  vitK:3.1,   selenium:2.2,  copper:0.34, manganese:0.24, choline:13.9, vitE:4.33, omega3:20  }},
  { id: 'hazelnuts',     name: 'Hazelnuts',       emoji: '🌰',
    per100g: { vitC:6.3,  vitA:1,   vitB6:0.56, vitB12:0,    iron:4.7,  zinc:2.45,  potassium:680,  calcium:114,  iodine:0,   magnesium:163, vitD:0,    folate:113, vitK:14.2,  selenium:2.4,  copper:1.73, manganese:6.17, choline:45.6, vitE:15,   omega3:87  }},
  { id: 'brazilnut',     name: 'Brazil Nut',      emoji: '🌰',
    per100g: { vitC:0.7,  vitA:0,   vitB6:0.1,  vitB12:0,    iron:2.43, zinc:4.06,  potassium:659,  calcium:160,  iodine:2,   magnesium:376, vitD:0,    folate:22,  vitK:0,     selenium:1917, copper:1.74, manganese:1.22, choline:28.8, vitE:5.73, omega3:18  }},
  { id: 'almonds',       name: 'Almonds',         emoji: '🌰',
    per100g: { vitC:0,    vitA:0,   vitB6:0.14, vitB12:0,    iron:3.71, zinc:3.12,  potassium:733,  calcium:264,  iodine:0,   magnesium:270, vitD:0,    folate:44,  vitK:0,     selenium:4.1,  copper:1.03, manganese:2.18, choline:52.1, vitE:25.6, omega3:0   }},
  { id: 'grapefruit',    name: 'Grapefruit',      emoji: '🍊',
    per100g: { vitC:38,   vitA:46,  vitB6:0.07, vitB12:0,    iron:0.08, zinc:0.07,  potassium:148,  calcium:22,   iodine:0,   magnesium:9,   vitD:0,    folate:10,  vitK:0,     selenium:0.1,  copper:0.06, manganese:0.02, choline:7.7,  vitE:0.13, omega3:7   }},
  { id: 'kefir',         name: 'Kefir',           emoji: '🥛',
    per100g: { vitC:0.5,  vitA:16,  vitB6:0.06, vitB12:0.5,  iron:0.05, zinc:0.38,  potassium:164,  calcium:120,  iodine:20,  magnesium:12,  vitD:0.1,  folate:5,   vitK:1,     selenium:2,    copper:0.01, manganese:0,    choline:16,   vitE:0.06, omega3:40  }},
  { id: 'oliveoil',      name: 'Olive Oil',       emoji: '🫒',
    per100g: { vitC:0,    vitA:0,   vitB6:0,    vitB12:0,    iron:0.56, zinc:0,     potassium:1,    calcium:1,    iodine:0,   magnesium:0,   vitD:0,    folate:0,   vitK:60,    selenium:0,    copper:0,    manganese:0,    choline:0.3,  vitE:14.35,omega3:760 }},
  { id: 'sardines',      name: 'Sardines',        emoji: '🐟',
    per100g: { vitC:0,    vitA:27,  vitB6:0.21, vitB12:8.9,  iron:2.92, zinc:1.31,  potassium:397,  calcium:382,  iodine:40,  magnesium:39,  vitD:4.8,  folate:10,  vitK:2.6,   selenium:52.7, copper:0.28, manganese:0.11, choline:75,   vitE:2,    omega3:2270}},
  { id: 'salmon',        name: 'Salmon',          emoji: '🐠',
    per100g: { vitC:0,    vitA:12,  vitB6:0.99, vitB12:3.18, iron:0.8,  zinc:0.64,  potassium:628,  calcium:14,   iodine:14,  magnesium:37,  vitD:13.1, folate:25,  vitK:0.5,   selenium:46.8, copper:0.29, manganese:0.02, choline:91,   vitE:3.55, omega3:2260}},
  { id: 'spinach',       name: 'Spinach',         emoji: '🥬',
    per100g: { vitC:28,   vitA:469, vitB6:0.2,  vitB12:0,    iron:2.71, zinc:0.53,  potassium:558,  calcium:99,   iodine:4,   magnesium:79,  vitD:0,    folate:194, vitK:483,   selenium:1,    copper:0.13, manganese:0.9,  choline:19.3, vitE:2.03, omega3:138 }},
  { id: 'pumpkinseeds',  name: 'Pumpkin Seeds',   emoji: '🫘',
    per100g: { vitC:1.9,  vitA:1,   vitB6:0.14, vitB12:0,    iron:8.07, zinc:7.64,  potassium:919,  calcium:46,   iodine:0,   magnesium:592, vitD:0,    folate:57,  vitK:7.3,   selenium:9.4,  copper:1.39, manganese:4.54, choline:63,   vitE:2.18, omega3:170 }},
  { id: 'darkchocolate', name: 'Dark Chocolate',  emoji: '🍫',
    per100g: { vitC:0,    vitA:2,   vitB6:0.06, vitB12:0,    iron:11.9, zinc:3.31,  potassium:715,  calcium:73,   iodine:0,   magnesium:228, vitD:0,    folate:13,  vitK:7.3,   selenium:6.8,  copper:1.77, manganese:1.95, choline:13.5, vitE:0.59, omega3:0   }},
  { id: 'lentils',       name: 'Lentils',         emoji: '🫘',
    per100g: { vitC:1.5,  vitA:1,   vitB6:0.18, vitB12:0,    iron:3.33, zinc:1.27,  potassium:369,  calcium:19,   iodine:0,   magnesium:36,  vitD:0,    folate:181, vitK:1.7,   selenium:2.8,  copper:0.25, manganese:0.49, choline:32.7, vitE:0.11, omega3:91  }},
  { id: 'banana',        name: 'Banana',          emoji: '🍌',
    per100g: { vitC:8.7,  vitA:3,   vitB6:0.37, vitB12:0,    iron:0.26, zinc:0.15,  potassium:358,  calcium:5,    iodine:0,   magnesium:27,  vitD:0,    folate:20,  vitK:0.5,   selenium:1,    copper:0.08, manganese:0.27, choline:9.8,  vitE:0.1,  omega3:27  }},
  { id: 'beef',          name: 'Beef (lean)',      emoji: '🥩',
    per100g: { vitC:0,    vitA:0,   vitB6:0.44, vitB12:2.5,  iron:2.6,  zinc:6.3,   potassium:318,  calcium:22,   iodine:4,   magnesium:24,  vitD:0.1,  folate:6,   vitK:1.5,   selenium:28.5, copper:0.12, manganese:0.02, choline:111,  vitE:0.18, omega3:40  }},
  { id: 'mackerel',      name: 'Mackerel',        emoji: '🐟',
    per100g: { vitC:0.4,  vitA:50,  vitB6:0.5,  vitB12:16.1, iron:1.63, zinc:0.94,  potassium:520,  calcium:11,   iodine:45,  magnesium:97,  vitD:16.1, folate:2,   vitK:5,     selenium:51.6, copper:0.11, manganese:0.02, choline:65,   vitE:1.99, omega3:3620}},
  { id: 'tuna',          name: 'Tuna',            emoji: '🐠',
    per100g: { vitC:0,    vitA:18,  vitB6:0.5,  vitB12:2.5,  iron:1.3,  zinc:0.77,  potassium:384,  calcium:11,   iodine:18,  magnesium:31,  vitD:2.3,  folate:4,   vitK:0,     selenium:90.6, copper:0.08, manganese:0.02, choline:65,   vitE:1.0,  omega3:280 }},
  { id: 'oysters',       name: 'Oysters',         emoji: '🦪',
    per100g: { vitC:5,    vitA:114, vitB6:0.05, vitB12:16.3, iron:5.59, zinc:39.3,  potassium:168,  calcium:45,   iodine:160, magnesium:22,  vitD:3.4,  folate:18,  vitK:0,     selenium:77,   copper:4.46, manganese:0.36, choline:65,   vitE:1.1,  omega3:440 }},
  { id: 'broccoli',      name: 'Broccoli',        emoji: '🥦',
    per100g: { vitC:89.2, vitA:31,  vitB6:0.17, vitB12:0,    iron:0.73, zinc:0.41,  potassium:316,  calcium:47,   iodine:10,  magnesium:21,  vitD:0,    folate:63,  vitK:101.6, selenium:2.5,  copper:0.05, manganese:0.21, choline:18.7, vitE:0.78, omega3:170 }},
  { id: 'blueberries',   name: 'Blueberries',     emoji: '🫐',
    per100g: { vitC:9.7,  vitA:3,   vitB6:0.05, vitB12:0,    iron:0.28, zinc:0.16,  potassium:77,   calcium:6,    iodine:0,   magnesium:6,   vitD:0,    folate:6,   vitK:19,    selenium:0.1,  copper:0.06, manganese:0.34, choline:6,    vitE:0.57, omega3:58  }},
  { id: 'walnuts',       name: 'Walnuts',         emoji: '🌰',
    per100g: { vitC:1.3,  vitA:1,   vitB6:0.54, vitB12:0,    iron:2.91, zinc:3.09,  potassium:441,  calcium:98,   iodine:0,   magnesium:158, vitD:0,    folate:98,  vitK:2.7,   selenium:4.9,  copper:1.59, manganese:3.41, choline:39.2, vitE:0.7,  omega3:9080}},
  { id: 'sunflowerseeds',name: 'Sunflower Seeds', emoji: '🌻',
    per100g: { vitC:1.4,  vitA:3,   vitB6:1.35, vitB12:0,    iron:5.25, zinc:5.0,   potassium:645,  calcium:78,   iodine:0,   magnesium:325, vitD:0,    folate:227, vitK:0,     selenium:79.3, copper:1.83, manganese:1.95, choline:55.1, vitE:35.17,omega3:91  }},
  { id: 'greekyogurt',   name: 'Greek Yogurt',    emoji: '🥛',
    per100g: { vitC:0,    vitA:27,  vitB6:0.07, vitB12:0.75, iron:0.08, zinc:0.52,  potassium:141,  calcium:110,  iodine:35,  magnesium:11,  vitD:0,    folate:7,   vitK:0,     selenium:9.7,  copper:0.01, manganese:0.01, choline:15.1, vitE:0.05, omega3:93  }},
  { id: 'mushrooms',     name: 'Mushrooms',       emoji: '🍄',
    per100g: { vitC:2.1,  vitA:0,   vitB6:0.11, vitB12:0,    iron:0.5,  zinc:0.52,  potassium:318,  calcium:3,    iodine:3,   magnesium:9,   vitD:0.2,  folate:17,  vitK:0,     selenium:9.3,  copper:0.32, manganese:0.05, choline:16.6, vitE:0.01, omega3:0   }},
  { id: 'edamame',       name: 'Edamame',         emoji: '🫘',
    per100g: { vitC:6.1,  vitA:4,   vitB6:0.1,  vitB12:0,    iron:2.27, zinc:1.37,  potassium:436,  calcium:63,   iodine:2,   magnesium:64,  vitD:0,    folate:311, vitK:26.7,  selenium:1.5,  copper:0.41, manganese:1.02, choline:56.7, vitE:0.68, omega3:0   }},
  { id: 'beetroot',      name: 'Beetroot',        emoji: '🫀',
    per100g: { vitC:3.6,  vitA:1,   vitB6:0.06, vitB12:0,    iron:0.79, zinc:0.35,  potassium:305,  calcium:16,   iodine:0,   magnesium:23,  vitD:0,    folate:80,  vitK:0.2,   selenium:0.7,  copper:0.08, manganese:0.33, choline:6.5,  vitE:0.04, omega3:0   }},
];

const SUPPLEMENTS = [
  { id: 'supp_vitD',   name: 'Vitamin D 50µg',        emoji: '💊', serving: '1 capsule',
    amounts: { vitD: 50 } },
  { id: 'supp_moller', name: 'Möller Omega-3',         emoji: '🐟', serving: '1 tbsp (10ml)',
    amounts: { omega3: 1110, vitD: 10, vitA: 250, vitE: 3 } },
  { id: 'supp_mag',    name: 'Magnesium Bisglycinate', emoji: '💊', serving: '1 capsule',
    amounts: { magnesium: 150 } },
];

const MICRONUTRIENTS = [
  // Daily
  { id: 'vitC',      name: 'Vitamin C',   cat: 'daily',  sauna: true,  rda: 90,   unit: 'mg',
    desc: 'Antioxidant and immune defence. Counters oxidative stress from heat — especially relevant post-sauna.' },
  { id: 'vitA',      name: 'Vitamin A',   cat: 'daily',  sauna: false, rda: 900,  unit: 'µg',
    desc: 'Vision, skin health, immune function and mucous membrane integrity.' },
  { id: 'vitB6',     name: 'Vitamin B6',  cat: 'daily',  sauna: false, rda: 1.3,  unit: 'mg',
    desc: 'Protein metabolism, neurotransmitter production. Supports mood and energy regulation.' },
  { id: 'vitB12',    name: 'Vitamin B12', cat: 'daily',  sauna: false, rda: 2.4,  unit: 'µg',
    desc: 'Nerve function, red blood cell formation, and energy metabolism.' },
  { id: 'iron',      name: 'Iron',        cat: 'daily',  sauna: false, rda: 8,    unit: 'mg',
    desc: 'Oxygen transport in blood. Low iron leads to fatigue and poor endurance.' },
  { id: 'zinc',      name: 'Zinc',        cat: 'daily',  sauna: true,  rda: 11,   unit: 'mg',
    desc: 'Immune function, testosterone support, wound healing. Lost through sweat — sauna relevant.' },
  { id: 'potassium', name: 'Potassium',   cat: 'daily',  sauna: true,  rda: 3500, unit: 'mg',
    desc: 'Key electrolyte for muscle contraction and heart rhythm. Depleted heavily in sauna sessions.' },
  { id: 'calcium',   name: 'Calcium',     cat: 'daily',  sauna: false, rda: 1000, unit: 'mg',
    desc: 'Bone density, muscle contraction, nerve signalling.' },
  { id: 'iodine',    name: 'Iodine',      cat: 'daily',  sauna: false, rda: 150,  unit: 'µg',
    desc: 'Thyroid hormone production and metabolic rate regulation.' },
  { id: 'magnesium', name: 'Magnesium',   cat: 'daily',  sauna: true,  rda: 420,  unit: 'mg',
    desc: 'Muscle relaxation, sleep quality, 300+ enzyme reactions. Lost heavily through sweat in sauna.' },
  { id: 'vitD',      name: 'Vitamin D',   cat: 'daily',  sauna: false, rda: 15,   unit: 'µg',
    desc: 'Bone health, immune modulation, mood regulation, and muscle recovery support.' },
  // Weekly
  { id: 'folate',    name: 'Folate (B9)', cat: 'weekly', sauna: false, rda: 400,  unit: 'µg',
    desc: 'DNA synthesis and repair, cell growth. Critical for long-term cellular health.' },
  { id: 'vitK',      name: 'Vitamin K',   cat: 'weekly', sauna: false, rda: 120,  unit: 'µg',
    desc: 'Blood clotting and bone mineralisation. K2 in kefir directs calcium to bones, not arteries.' },
  { id: 'selenium',  name: 'Selenium',    cat: 'weekly', sauna: true,  rda: 55,   unit: 'µg',
    desc: 'Powerful antioxidant, thyroid function, DNA repair. Brazil nuts are the richest food source.' },
  { id: 'copper',    name: 'Copper',      cat: 'weekly', sauna: false, rda: 0.9,  unit: 'mg',
    desc: 'Iron absorption, collagen formation, antioxidant enzyme production.' },
  { id: 'manganese', name: 'Manganese',   cat: 'weekly', sauna: false, rda: 2.3,  unit: 'mg',
    desc: 'Bone formation, antioxidant defence, carbohydrate and amino acid metabolism.' },
  { id: 'choline',   name: 'Choline',     cat: 'weekly', sauna: false, rda: 550,  unit: 'mg',
    desc: 'Liver function, brain health, cell membrane integrity. Eggs are your primary source.' },
  { id: 'vitE',      name: 'Vitamin E',   cat: 'weekly', sauna: true,  rda: 15,   unit: 'mg',
    desc: 'Fat-soluble antioxidant protecting cell membranes. Reduces oxidative stress post-sauna.' },
  { id: 'omega3',    name: 'Omega-3',     cat: 'weekly', sauna: true,  rda: 1600, unit: 'mg',
    desc: 'Anti-inflammatory, cardiovascular health, brain function. Reduces inflammation after sauna.' },
];

// Estimated nutrient losses / increased demand per sauna session
const SAUNA_LOSSES = {
  potassium: 400,  // mg  — direct sweat loss
  magnesium: 36,   // mg  — direct sweat loss
  zinc:      1,    // mg  — direct sweat loss
  vitC:      30,   // mg  — increased antioxidant demand
  selenium:  12,   // µg  — direct sweat loss
  vitE:      2,    // mg  — increased oxidative demand
  omega3:    150,  // mg  — increased anti-inflammatory demand
};

const state = {
  saunaLogs: [],
  dayLogs: [],
  fitnessTab: 'cut',
  courses: [],
  studyLogs: [],
  weightLogs: [],
  nutritionLogs: [],
  habits: [],
  habitLogs: [],
  todos: [],
  notes: [],
  notesTab: 'daily',
  microLogs: [],
  microsTab: 'daily',
  selectedMicroFood: null,
  settings: {},
  selectedDeficit: 500,
  currentWeekOffset: 0,
  currentMonthOffset: 0,
  fitnessWeekOffset: 0,
};

// ==========================================
// UTILS
// ==========================================

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(y, m - 1, d + n);
  return `${result.getFullYear()}-${String(result.getMonth()+1).padStart(2,'0')}-${String(result.getDate()).padStart(2,'0')}`;
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
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
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

async function ensureMitreAtlas() {
  const existing = state.courses.find(c => c.name === 'MITRE ATLAS');
  if (existing) return;
  const maxOrder = state.courses.reduce((m, c) => Math.max(m, c.order_index || 0), -1);
  const { data } = await db.from('courses').insert({
    name: 'MITRE ATLAS',
    platform: 'MITRE',
    description: 'Adversarial Threat Landscape for AI Systems. Reading during work.',
    status: 'in_progress',
    order_index: maxOrder + 1,
  }).select().single();
  if (data) { state.courses.push(data); state.courses.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)); }
}

async function launchApp(url, key) {
  try {
    db = window.supabase.createClient(url, key);
    await seedDataIfEmpty();
    await loadAllData();
    await ensureMitreAtlas();
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
    { data: todos },
    { data: settings },
  ] = await Promise.all([
    db.from('courses').select('*').order('order_index'),
    db.from('study_logs').select('*').order('date', { ascending: false }),
    db.from('weight_logs').select('*').order('date'),
    db.from('nutrition_logs').select('*').order('date'),
    db.from('habits').select('*').eq('is_active', true).order('order_index'),
    db.from('habit_logs').select('*'),
    db.from('todos').select('*').order('created_at'),
    db.from('settings').select('*'),
  ]);

  state.courses = courses || [];
  state.studyLogs = studyLogs || [];
  state.weightLogs = weightLogs || [];
  state.nutritionLogs = nutritionLogs || [];
  state.habits = (habits || []).filter(h => h.is_active);
  state.habitLogs = habitLogs || [];
  state.todos = todos || [];
  state.settings = Object.fromEntries((settings || []).map(s => [s.key, s.value]));
  state.selectedDeficit = parseInt(getSetting('selected_deficit', '500'));

  const { data: saunaLogs, error: saunaErr } = await db.from('sauna_logs').select('*').order('date', { ascending: false });
  state.saunaLogs = saunaErr ? null : (saunaLogs || []);

  const { data: dayLogs, error: dayErr } = await db.from('day_logs').select('*').order('date', { ascending: false });
  state.dayLogs = dayErr ? null : (dayLogs || []);

  const { data: notes, error: notesErr } = await db.from('notes').select('*').order('created_at', { ascending: false });
  state.notes = notesErr ? null : (notes || []);

  const { data: microLogs, error: microErr } = await db.from('micro_logs').select('*').order('date', { ascending: false });
  state.microLogs = microErr ? null : (microLogs || []);
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
  if (section === 'notes') renderNotes();
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
      pairs.push({ dayNum: new Date(w.date + 'T00:00:00').getTime() / 86400000, weight: parseFloat(w.weight), calories: parseInt(n.calories) });
    }
  });

  if (pairs.length < 3) return { tdee: null, confidence: 'insufficient', dataPoints: pairs.length };

  pairs.sort((a, b) => a.dayNum - b.dayNum);
  const n = pairs.length;
  const daySpan = pairs[n - 1].dayNum - pairs[0].dayNum;
  if (daySpan < 1) return { tdee: null, confidence: 'insufficient', dataPoints: n };

  const avgCalories = pairs.reduce((s, p) => s + p.calories, 0) / n;

  // Linear regression on weight over time — more robust than first/last points
  const xMean = pairs.reduce((s, p) => s + p.dayNum, 0) / n;
  const yMean = pairs.reduce((s, p) => s + p.weight, 0) / n;
  const num = pairs.reduce((s, p) => s + (p.dayNum - xMean) * (p.weight - yMean), 0);
  const den = pairs.reduce((s, p) => s + Math.pow(p.dayNum - xMean, 2), 0);
  const weightChangePerDay = den > 0 ? num / den : 0;

  const tdeeRaw = Math.round(avgCalories - weightChangePerDay * KCAL_PER_KG);

  // Sanity clamp — no realistic TDEE is outside 1200–4500 kcal
  if (tdeeRaw < 1200 || tdeeRaw > 4500) return { tdee: null, confidence: 'noisy', dataPoints: n };

  const confidence = n < 7 ? 'low' : n < 14 ? 'medium' : n < 28 ? 'good' : 'high';
  return { tdee: tdeeRaw, confidence, dataPoints: n };
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

  const renderCard = course => {
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
  };

  const active = state.courses.filter(c => c.status !== 'not_started');
  const notStarted = state.courses.filter(c => c.status === 'not_started');

  let html = active.map(renderCard).join('');
  if (notStarted.length) {
    html += `<div class="course-section-divider" style="grid-column:1/-1">Not Yet Started</div>`;
    html += notStarted.map(renderCard).join('');
  }
  grid.innerHTML = html;
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
  renderWeeklyDataTable();
  renderWeightChart();
  renderTDEEInfo();
}

function navigateFitnessWeek(dir) {
  const newOffset = state.fitnessWeekOffset + dir;
  if (newOffset > 0) return;
  state.fitnessWeekOffset = newOffset;
  renderWeeklyDataTable();
}

function renderWeeklyDataTable() {
  const weekDates = getWeekDates(state.fitnessWeekOffset);
  const today = todayStr();
  const { tdee } = calculateAdaptiveTDEE();
  const target = tdee ? tdee - state.selectedDeficit : null;

  // Week label
  const labelEl = document.getElementById('fitness-week-label');
  if (labelEl) labelEl.textContent = `${formatDateDisplay(weekDates[0])} – ${formatDateDisplay(weekDates[6])}`;
  const nextBtn = document.getElementById('fitness-week-next-btn');
  if (nextBtn) { nextBtn.disabled = state.fitnessWeekOffset >= 0; nextBtn.style.opacity = state.fitnessWeekOffset >= 0 ? '0.4' : '1'; }

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const rows = weekDates.map((date, i) => {
    const w = state.weightLogs.find(l => l.date === date);
    const n = state.nutritionLogs.find(l => l.date === date);
    const isFuture = date > today;
    const isToday = date === today;
    const dayLabel = isToday ? 'Today' : dayNames[i];

    if (isFuture) {
      return `<tr><td>${dayLabel}</td><td class="wt-empty">—</td><td class="wt-empty">—</td><td class="wt-empty">—</td><td class="wt-empty">—</td><td class="wt-empty">—</td></tr>`;
    }

    const calClass = n && target ? (Math.abs(n.calories - target) < 150 ? 'wt-on-target' : n.calories > target + 150 ? 'wt-over' : '') : '';

    return `<tr class="${isToday ? 'wt-today' : ''}">
      <td>${dayLabel}</td>
      <td>${w ? w.weight : '<span class="wt-empty">—</span>'}</td>
      <td class="${calClass}">${n ? n.calories : '<span class="wt-empty">—</span>'}</td>
      <td>${n && n.protein ? n.protein : '<span class="wt-empty">—</span>'}</td>
      <td>${n && n.carbs ? n.carbs : '<span class="wt-empty">—</span>'}</td>
      <td>${n && n.fat ? n.fat : '<span class="wt-empty">—</span>'}</td>
    </tr>`;
  });

  // Averages (only past/today days with data)
  const pastDates = weekDates.filter(d => d <= today);
  const wLogs = pastDates.map(d => state.weightLogs.find(l => l.date === d)).filter(Boolean);
  const nLogs = pastDates.map(d => state.nutritionLogs.find(l => l.date === d)).filter(Boolean);
  const avg = (arr, key) => arr.length ? (arr.reduce((s, x) => s + parseFloat(x[key] || 0), 0) / arr.length) : null;

  const avgW = avg(wLogs, 'weight');
  const avgCal = avg(nLogs, 'calories');
  const avgPro = avg(nLogs, 'protein');
  const avgCarb = avg(nLogs, 'carbs');
  const avgFat = avg(nLogs, 'fat');
  const calClass = avgCal && target ? (Math.abs(avgCal - target) < 150 ? 'wt-on-target' : avgCal > target + 150 ? 'wt-over' : '') : '';

  const avgRow = `<tr class="wt-avg">
    <td>Avg</td>
    <td>${avgW ? avgW.toFixed(1) : '—'}</td>
    <td class="${calClass}">${avgCal ? Math.round(avgCal) : '—'}</td>
    <td>${avgPro ? avgPro.toFixed(0) : '—'}</td>
    <td>${avgCarb ? avgCarb.toFixed(0) : '—'}</td>
    <td>${avgFat ? avgFat.toFixed(0) : '—'}</td>
  </tr>`;

  const table = document.getElementById('weekly-data-table');
  if (!table) return;
  table.innerHTML = `
    <thead><tr>
      <th>Day</th><th>Weight</th><th>Kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th>
    </tr></thead>
    <tbody>${rows.join('')}${avgRow}</tbody>
  `;
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
  const today = todayStr();
  const dow = (new Date().getDay() + 6) % 7;
  const thisWeekStart = addDays(today, -dow);
  const thisWeekLogs = state.weightLogs.filter(l => l.date >= thisWeekStart && l.date <= today);
  const weekAvg = thisWeekLogs.length
    ? (thisWeekLogs.reduce((s, l) => s + parseFloat(l.weight), 0) / thisWeekLogs.length).toFixed(1)
    : null;
  const latest = state.weightLogs.length ? state.weightLogs[state.weightLogs.length - 1] : null;
  const wow = getWeekOverWeekWeight();
  const wowHtml = wow
    ? `<div class="stat-wow" style="color:${parseFloat(wow.delta) < 0 ? 'var(--success)' : parseFloat(wow.delta) > 0 ? 'var(--fitness)' : 'var(--text-dim)'}">${parseFloat(wow.delta) > 0 ? '+' : ''}${wow.delta} kg vs last wk</div>`
    : '';
  document.getElementById('current-weight').innerHTML = (weekAvg ? weekAvg + ' kg' : latest ? latest.weight + ' kg' : '—') + wowHtml;

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
  document.getElementById('deficit-display').textContent = `-${deficit} kcal`;
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
    const msg = confidence === 'noisy'
      ? `<strong>Adaptive TDEE</strong> — Too noisy to estimate reliably yet (${dataPoints} days logged). Day-to-day weight swings from water retention are masking the real trend. Keep logging — it stabilises quickly after 7+ days.`
      : `<strong>Adaptive TDEE</strong><br>Your estimated maintenance calories will appear here once you have at least 3 days of paired weight + calorie data. The more data, the more accurate it gets.`;
    card.innerHTML = msg;
    return;
  }
  const confidenceDesc = { low: 'Early estimate — keep logging', medium: 'Getting there — needs more data', good: 'Pretty solid — improving with each day', high: 'Highly accurate' }[confidence];
  card.innerHTML = `<strong>Adaptive TDEE</strong> — Based on <strong style="color:var(--fitness-light)">${dataPoints} days</strong> of data. Accuracy: ${confidenceDesc}. Uses linear regression across all data points to filter out day-to-day water weight noise.`;
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
// SAUNA TRACKER
// ==========================================

const DAY_TYPES = [
  { id: 'upper_sauna',      icon: '💪', label: 'Upper + Sauna',         desc: 'Upper body training → straight into sauna',             hasSauna: true,  suggestedProtocol: 'recovery' },
  { id: 'lower_sauna',      icon: '🦵', label: 'Lower + Sauna',         desc: 'Lower body training → straight into sauna',             hasSauna: true,  suggestedProtocol: 'recovery' },
  { id: 'rest_sauna',       icon: '🧖', label: 'Rest + Sauna',          desc: 'No workout — sauna as the main recovery tool',          hasSauna: true,  suggestedProtocol: 'double'   },
  { id: 'upper_work_sauna', icon: '🏋️', label: 'Upper → Work → Sauna', desc: 'Upper workout · 6h work block · evening sauna',         hasSauna: true,  suggestedProtocol: 'gh'       },
  { id: 'lower_work_sauna', icon: '🏃', label: 'Lower → Work → Sauna', desc: 'Lower workout · 6h work block · evening sauna',         hasSauna: true,  suggestedProtocol: 'gh'       },
  { id: 'full_rest',        icon: '🌙', label: 'Full Rest',             desc: 'Complete recovery — no workout, no sauna',              hasSauna: false, suggestedProtocol: null       },
];

function renderDaySchedule() {
  const el = document.getElementById('sauna-schedule');
  if (!el) return;

  const today = todayStr();
  const dow = (new Date().getDay() + 6) % 7;
  const weekStart = addDays(today, -dow);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const todayLog = (state.dayLogs || []).find(l => l.date === today);
  const todayType = todayLog ? DAY_TYPES.find(t => t.id === todayLog.day_type) : null;

  const strip = dayNames.map((name, i) => {
    const date = addDays(weekStart, i);
    const log = (state.dayLogs || []).find(l => l.date === date);
    const type = log ? DAY_TYPES.find(t => t.id === log.day_type) : null;
    const isToday = date === today;
    return `
      <div class="strip-day ${isToday ? 'today' : ''} ${!type ? 'empty' : ''}">
        <div class="strip-day-name">${name}</div>
        <div class="strip-day-icon">${type ? type.icon : '·'}</div>
        <div class="strip-day-label">${type ? type.label.split(' ')[0] : ''}</div>
      </div>`;
  }).join('');

  const cards = DAY_TYPES.map(type => {
    const isActive = todayType?.id === type.id;
    const suggested = type.suggestedProtocol ? SAUNA_PROTOCOLS.find(p => p.id === type.suggestedProtocol)?.name : null;
    return `
      <div class="day-type-card ${isActive ? 'active' : ''}" onclick="logDayType('${type.id}')">
        <div class="day-type-icon">${type.icon}</div>
        <div class="day-type-body">
          <div class="day-type-label">${type.label}</div>
          <div class="day-type-desc">${type.desc}</div>
          ${suggested ? `<div class="day-type-suggested">→ ${suggested}</div>` : ''}
        </div>
        ${isActive ? '<div class="day-type-check">✓</div>' : ''}
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Today's Schedule</h3></div>
      <div class="schedule-strip">${strip}</div>
      <div class="day-type-grid">${cards}</div>
    </div>`;
}

async function logDayType(typeId) {
  if (state.dayLogs === null) { showToast('Run the setup SQL first — day_logs table missing', 'error'); return; }
  const date = document.getElementById('sauna-date').value || todayStr();
  const existing = (state.dayLogs || []).find(l => l.date === date);
  let data, error;
  if (existing) {
    ({ data, error } = await db.from('day_logs').update({ day_type: typeId }).eq('id', existing.id).select().single());
    if (data) existing.day_type = typeId;
  } else {
    ({ data, error } = await db.from('day_logs').insert({ date, day_type: typeId }).select().single());
    if (data) state.dayLogs.push(data);
  }
  if (error) { showToast('Failed to log day type', 'error'); return; }
  renderSaunaTab();
  showToast(`${DAY_TYPES.find(t => t.id === typeId)?.label} logged!`);
}

const SAUNA_PROTOCOLS = [
  {
    id: 'base', name: 'Base Session', structure: '1 × 20 min', duration: 20, tag: 'Daily driver',
    benefits: ['Cortisol reset (~30% drop)', 'Improved sleep onset', 'Cardiovascular maintenance', 'Muscle relaxation & recovery'],
  },
  {
    id: 'double', name: 'Double Round', structure: '2 × 15 min + cold break', duration: 30, tag: '2–3× per week',
    benefits: ['2–5× growth hormone baseline', 'Norepinephrine boost from cold contrast', 'Stronger cardiovascular training effect'],
  },
  {
    id: 'gh', name: 'GH Protocol', structure: '2 × 20 min + cold shower', duration: 40, tag: '1–2× per week',
    benefits: ['Maximum GH spike for session length', 'Directly supports muscle retention on cut', 'Enhanced fat oxidation post-session'],
  },
  {
    id: 'contrast', name: 'Contrast Protocol', structure: '3 × 12 min, heat/cold alternating', duration: 36, tag: 'Once per week',
    benefits: ['Peak cardiovascular adaptation', 'Largest norepinephrine surge (focus & mood)', 'Immune system activation'],
  },
  {
    id: 'recovery', name: 'Recovery Session', structure: '1 × 15 min', duration: 15, tag: 'Post-training',
    benefits: ['Targets muscle inflammation specifically', 'Accelerates lactic acid clearance', 'Parasympathetic activation (rest & digest)'],
  },
  {
    id: 'deep', name: 'Deep Heat', structure: '1 × 30 min', duration: 30, tag: 'Once per week',
    benefits: ['Maximum HSP70 production', 'Cellular stress protection', 'Deeper cardiovascular adaptation'],
  },
];

const SAUNA_MILESTONES = [
  { sessions: 1,  desc: 'Acute cortisol drop (~30%), endorphin release, deep muscle relaxation.' },
  { sessions: 5,  desc: 'Improved sleep onset and quality, better recovery from training.' },
  { sessions: 10, desc: 'Heat shock protein (HSP70) upregulation — cellular stress protection begins.' },
  { sessions: 20, desc: 'Cardiovascular adaptations: lower resting HR, improved circulation.' },
  { sessions: 30, desc: 'Measurable growth hormone spikes — supports muscle retention on a cut.' },
  { sessions: 50, desc: 'Matches the Finnish cohort protocol linked to 40% lower cardiovascular mortality.' },
];

function switchFitnessTab(tab) {
  state.fitnessTab = tab;
  document.querySelectorAll('.fitness-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.fitness-tab-pane').forEach(p => p.classList.add('hidden'));
  document.getElementById(`fitness-tab-${tab}`).classList.remove('hidden');
  if (tab === 'sauna') renderSaunaTab();
  if (tab === 'micros') renderMicroTab();
}

function renderSaunaTab() {
  const notice = document.getElementById('sauna-setup-notice');
  const main = document.getElementById('sauna-main-content');

  if (state.saunaLogs === null || state.dayLogs === null) {
    notice.classList.remove('hidden');
    main.classList.add('hidden');
    return;
  }
  notice.classList.add('hidden');
  main.classList.remove('hidden');

  const dateInput = document.getElementById('sauna-date');
  if (!dateInput.value) dateInput.value = todayStr();

  const logs = state.saunaLogs;
  const totalSessions = logs.length;
  const totalMinutes = logs.reduce((s, l) => s + l.duration_minutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const avgMin = totalSessions ? Math.round(totalMinutes / totalSessions) : 0;
  const thisMonth = todayStr().slice(0, 7);
  const thisMonthCount = logs.filter(l => l.date.startsWith(thisMonth)).length;

  document.getElementById('sauna-total-sessions').textContent = totalSessions || '—';
  document.getElementById('sauna-total-hours').textContent = totalSessions ? totalHours + 'h' : '—';
  document.getElementById('sauna-this-month').textContent = thisMonthCount || '—';
  document.getElementById('sauna-avg-duration').textContent = avgMin ? avgMin + 'm' : '—';

  renderDaySchedule();

  const dow = (new Date().getDay() + 6) % 7;
  const thisWeekStart = addDays(todayStr(), -dow);
  const todayDayLog = (state.dayLogs || []).find(l => l.date === todayStr());
  const todayDayType = todayDayLog ? DAY_TYPES.find(t => t.id === todayDayLog.day_type) : null;
  const suggestedProtoId = todayDayType?.suggestedProtocol || null;

  document.getElementById('sauna-protocols').innerHTML = SAUNA_PROTOCOLS.map(p => {
    const weekCount = logs.filter(l => l.protocol === p.id && l.date >= thisWeekStart).length;
    const isSuggested = p.id === suggestedProtoId;
    return `
      <div class="protocol-card ${isSuggested ? 'suggested' : ''}">
        <div class="protocol-card-header">
          <div class="protocol-name">${p.name}${isSuggested ? ' <span class="protocol-suggested-badge">Suggested</span>' : ''}</div>
          <span class="protocol-tag">${p.tag}</span>
        </div>
        <div class="protocol-structure">${p.structure}</div>
        <ul class="protocol-benefits-list">
          ${p.benefits.map(b => `<li>${b}</li>`).join('')}
        </ul>
        <div class="protocol-footer">
          ${weekCount > 0
            ? `<span class="protocol-week-count">✓ ${weekCount}× this week</span>`
            : '<span></span>'}
          <button class="btn-primary btn-sm" onclick="logSaunaProtocol('${p.id}', ${p.duration})">Log</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('sauna-benefits').innerHTML = SAUNA_MILESTONES.map(m => {
    const unlocked = totalSessions >= m.sessions;
    const remaining = m.sessions - totalSessions;
    return `
      <div class="sauna-benefit ${unlocked ? 'unlocked' : 'locked'}">
        <div class="sauna-benefit-icon">${unlocked ? '🔥' : '🔒'}</div>
        <div class="sauna-benefit-body">
          <div class="sauna-benefit-title">
            ${m.sessions} session${m.sessions > 1 ? 's' : ''}
            ${unlocked
              ? '<span class="sauna-unlocked-badge">Unlocked</span>'
              : `<span class="sauna-remaining">${remaining} to go</span>`}
          </div>
          <div class="sauna-benefit-desc">${m.desc}</div>
        </div>
      </div>`;
  }).join('');

  const historyEl = document.getElementById('sauna-history');
  if (!logs.length) {
    historyEl.innerHTML = '<div class="no-logs">No sessions yet. Log your first sauna visit above.</div>';
    return;
  }

  const foundationLogs = logs.filter(l => l.protocol === 'foundation');
  const regularLogs = logs.filter(l => l.protocol !== 'foundation');

  let historyHtml = regularLogs.map(l => {
    const proto = l.protocol ? SAUNA_PROTOCOLS.find(p => p.id === l.protocol) : null;
    return `
    <div class="log-entry">
      <div class="log-entry-left">
        <div class="log-entry-date">${formatDateDisplay(l.date)}</div>
        ${proto ? `<div class="log-entry-notes">${proto.name}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="log-entry-duration">${l.duration_minutes}m</div>
        <button class="btn-danger btn-sm" onclick="deleteSaunaLog('${l.id}')">✕</button>
      </div>
    </div>`;
  }).join('');

  if (foundationLogs.length) {
    const weeks = Math.round(foundationLogs.length / 4);
    const totalH = (foundationLogs.reduce((s, l) => s + l.duration_minutes, 0) / 60).toFixed(0);
    historyHtml += `
    <div class="foundation-block">
      <div class="foundation-icon">🏗️</div>
      <div class="foundation-body">
        <div class="foundation-label">Foundation</div>
        <div class="foundation-desc">${foundationLogs.length} sessions · ~${totalH}h · ${weeks} weeks pre-tracking baseline</div>
      </div>
    </div>`;
  }

  historyEl.innerHTML = historyHtml;

  const foundationEl = document.getElementById('sauna-foundation-entry');
  if (!foundationLogs.length) {
    const defaultDate = addDays(todayStr(), -365);
    foundationEl.innerHTML = `
      <div class="card" style="border-style:dashed">
        <div class="card-header">
          <h3>Pre-Tracker Sessions</h3>
        </div>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px">Had sessions before you started tracking? Add them here — they'll appear as a Foundation block in your history and count towards your milestones.</p>
        <div class="sauna-form" style="flex-wrap:wrap">
          <div class="entry-field">
            <label>Number of sessions</label>
            <input type="number" id="foundation-count" min="1" max="999" placeholder="e.g. 40">
          </div>
          <div class="entry-field">
            <label>Avg duration (min)</label>
            <input type="number" id="foundation-duration" min="5" max="180" step="5" placeholder="e.g. 20">
          </div>
          <div class="entry-field">
            <label>Approx. date</label>
            <input type="date" id="foundation-date" value="${defaultDate}">
          </div>
        </div>
        <button class="btn-secondary" onclick="logFoundationSessions()" style="margin-top:14px">Add as Foundation</button>
      </div>`;
  } else {
    foundationEl.innerHTML = '';
  }
}

async function logFoundationSessions() {
  const count = parseInt(document.getElementById('foundation-count').value);
  const duration = parseInt(document.getElementById('foundation-duration').value);
  const date = document.getElementById('foundation-date').value;
  if (!count || count < 1 || !duration || duration < 1 || !date) {
    showToast('Fill in all three fields', 'error'); return;
  }
  const rows = Array.from({ length: count }, () => ({ date, duration_minutes: duration, protocol: 'foundation' }));
  const { data, error } = await db.from('sauna_logs').insert(rows).select();
  if (error || !data) { showToast('Failed to save foundation sessions', 'error'); return; }
  state.saunaLogs = [...state.saunaLogs, ...data].sort((a, b) => b.date.localeCompare(a.date));
  renderSaunaTab();
  showToast(`${count} pre-tracker sessions added!`);
}

async function logSaunaProtocol(protocolId, duration) {
  const date = document.getElementById('sauna-date').value || todayStr();
  let { data, error } = await db.from('sauna_logs').insert({ date, duration_minutes: duration, protocol: protocolId }).select().single();
  if (error && (error.code === '42703' || (error.message || '').includes('protocol'))) {
    // protocol column missing — run "ALTER TABLE sauna_logs ADD COLUMN IF NOT EXISTS protocol TEXT;" in Supabase
    ({ data, error } = await db.from('sauna_logs').insert({ date, duration_minutes: duration }).select().single());
  }
  if (error || !data) { showToast('Failed to log session', 'error'); return; }
  state.saunaLogs.unshift(data);
  state.saunaLogs.sort((a, b) => b.date.localeCompare(a.date));
  renderSaunaTab();
  const name = SAUNA_PROTOCOLS.find(p => p.id === protocolId)?.name || 'Session';
  showToast(`${name} logged!`);
}

async function saveSaunaLog() {
  const date = document.getElementById('sauna-date').value;
  const duration = parseInt(document.getElementById('sauna-duration').value);
  if (!date || !duration || duration < 1) { showToast('Enter a valid date and duration', 'error'); return; }

  const { data, error } = await db.from('sauna_logs').insert({ date, duration_minutes: duration }).select().single();
  if (error || !data) { showToast('Failed to save session', 'error'); return; }

  state.saunaLogs.unshift(data);
  state.saunaLogs.sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById('sauna-duration').value = '';
  renderSaunaTab();
  showToast('Custom session logged!');
}

async function deleteSaunaLog(id) {
  await db.from('sauna_logs').delete().eq('id', id);
  state.saunaLogs = state.saunaLogs.filter(l => l.id !== id);
  renderSaunaTab();
}

async function retrySaunaLoad() {
  const { data: sl, error: slErr } = await db.from('sauna_logs').select('*').order('date', { ascending: false });
  if (slErr) { showToast('sauna_logs not found — run the SQL first', 'error'); return; }
  state.saunaLogs = sl || [];
  const { data: dl, error: dlErr } = await db.from('day_logs').select('*').order('date', { ascending: false });
  state.dayLogs = dlErr ? null : (dl || []);
  renderSaunaTab();
}

// ==========================================
// NOTES / JOURNAL
// ==========================================

function switchNotesTab(tab) {
  state.notesTab = tab;
  document.querySelectorAll('.notes-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderNotes();
}

function renderNotes() {
  const notice = document.getElementById('notes-setup-notice');
  const main = document.getElementById('notes-main-content');
  if (state.notes === null) {
    notice.classList.remove('hidden');
    main.classList.add('hidden');
    return;
  }
  notice.classList.add('hidden');
  main.classList.remove('hidden');
  if (state.notesTab === 'daily') renderDailyNotes(main);
  else renderInsightNotes(main);
}

function renderDailyNotes(el) {
  const today = todayStr();
  const todayEntry = state.notes.find(n => n.category === 'daily' && n.date === today);
  const past = state.notes
    .filter(n => n.category === 'daily' && n.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date));

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Today</h3>
        <span style="font-size:0.8rem;color:var(--text-muted)">${formatDateDisplay(today)}</span>
      </div>
      <textarea id="note-daily-input" class="note-textarea" placeholder="What's on your mind? Reflections, observations, how the day went...">${todayEntry ? todayEntry.content : ''}</textarea>
      <button class="btn-secondary" onclick="saveNote('daily')" style="margin-top:12px">${todayEntry ? 'Update' : 'Save'}</button>
    </div>
    ${past.length ? `<div class="notes-history">${past.map(n => `
      <div class="note-entry card">
        <div class="note-entry-header">
          <span class="note-entry-date">${formatDateDisplay(n.date)}</span>
          <button class="btn-danger btn-sm" onclick="deleteNote('${n.id}')">✕</button>
        </div>
        <div class="note-entry-content">${n.content.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
      </div>`).join('')}</div>` : ''}`;
}

function renderInsightNotes(el) {
  const insights = state.notes
    .filter(n => n.category === 'insights')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>New Insight</h3></div>
      <input type="text" id="note-insight-title" class="note-title-input" placeholder="Title (optional)">
      <textarea id="note-insight-input" class="note-textarea" placeholder="Capture an insight, idea, or observation..."></textarea>
      <button class="btn-secondary" onclick="saveNote('insights')" style="margin-top:12px">Add Insight</button>
    </div>
    ${insights.length ? `<div class="notes-history">${insights.map(n => `
      <div class="note-entry card">
        <div class="note-entry-header">
          <div>
            ${n.title ? `<div class="note-entry-title">${n.title.replace(/</g,'&lt;')}</div>` : ''}
            <span class="note-entry-date">${formatDateDisplay(n.date)}</span>
          </div>
          <button class="btn-danger btn-sm" onclick="deleteNote('${n.id}')">✕</button>
        </div>
        <div class="note-entry-content">${n.content.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>
      </div>`).join('')}</div>` : '<p style="font-size:0.85rem;color:var(--text-muted);margin-top:16px">No insights yet. Add your first one above.</p>'}`;
}

async function saveNote(category) {
  const today = todayStr();
  if (category === 'daily') {
    const content = document.getElementById('note-daily-input').value.trim();
    if (!content) { showToast('Write something first', 'error'); return; }
    const existing = state.notes.find(n => n.category === 'daily' && n.date === today);
    if (existing) {
      const { data, error } = await db.from('notes').update({ content }).eq('id', existing.id).select().single();
      if (error) { showToast('Failed to save', 'error'); return; }
      existing.content = data.content;
    } else {
      const { data, error } = await db.from('notes').insert({ category, date: today, content }).select().single();
      if (error) { showToast('Failed to save', 'error'); return; }
      state.notes.unshift(data);
    }
  } else {
    const content = document.getElementById('note-insight-input').value.trim();
    const title = document.getElementById('note-insight-title').value.trim() || null;
    if (!content) { showToast('Write something first', 'error'); return; }
    const { data, error } = await db.from('notes').insert({ category, date: today, title, content }).select().single();
    if (error) { showToast('Failed to save', 'error'); return; }
    state.notes.unshift(data);
  }
  renderNotes();
  showToast('Saved!');
}

async function deleteNote(id) {
  await db.from('notes').delete().eq('id', id);
  state.notes = state.notes.filter(n => n.id !== id);
  renderNotes();
}

async function retryNotesLoad() {
  const { data, error } = await db.from('notes').select('*').order('created_at', { ascending: false });
  if (error) { showToast('notes table not found — run the SQL first', 'error'); return; }
  state.notes = data || [];
  renderNotes();
}

// ==========================================
// MICRO NUTRIENTS
// ==========================================

function switchMicrosView(view) {
  state.microsTab = view;
  document.querySelectorAll('.micros-view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  renderMicroContent();
}

function renderMicroTab() {
  const notice = document.getElementById('micros-setup-notice');
  const main = document.getElementById('micros-main-content');
  if (state.microLogs === null) {
    notice.classList.remove('hidden');
    main.classList.add('hidden');
    return;
  }
  notice.classList.add('hidden');
  main.classList.remove('hidden');
  renderMicroContent();
}

function getTotalNutrientAmounts(dayLogs) {
  const totals = {};
  MICRONUTRIENTS.forEach(n => { totals[n.id] = 0; });
  dayLogs.forEach(l => {
    const grams = parseFloat(l.grams || 100);
    if (l.food.startsWith('supp_')) {
      const supp = SUPPLEMENTS.find(s => s.id === l.food);
      if (supp && supp.amounts) {
        Object.entries(supp.amounts).forEach(([nid, amt]) => {
          if (totals[nid] !== undefined) totals[nid] += amt * grams;
        });
      }
    } else {
      const food = FOODS.find(f => f.id === l.food);
      if (food && food.per100g) {
        Object.entries(food.per100g).forEach(([nid, per100]) => {
          if (totals[nid] !== undefined) totals[nid] += per100 * (grams / 100);
        });
      }
    }
  });
  return totals;
}

function formatNutrientAmt(amount, unit) {
  if (amount === 0) return `0 ${unit}`;
  if (amount < 0.05) return `<0.1 ${unit}`;
  if (amount < 10) return `${parseFloat(amount.toFixed(1))} ${unit}`;
  return `${Math.round(amount)} ${unit}`;
}

function renderMicroContent() {
  const main = document.getElementById('micros-main-content');
  const today = todayStr();
  const dateEl = document.getElementById('micro-date');
  const microDate = (dateEl && dateEl.value) ? dateEl.value : today;

  const dayLogs = state.microLogs.filter(l => l.date === microDate);
  const loggedSuppIds = dayLogs.filter(l => l.food.startsWith('supp_')).map(l => l.food);
  const foodEntries = dayLogs.filter(l => !l.food.startsWith('supp_'));
  const sel = state.selectedMicroFood;

  const foodChips = FOODS.map(f => {
    const count = foodEntries.filter(l => l.food === f.id).length;
    const isSelected = f.id === sel;
    let cls = 'food-chip';
    if (isSelected) cls += ' selected';
    else if (count > 0) cls += ' logged';
    return `<button class="${cls}" onclick="selectMicroFood('${f.id}')">${f.emoji} ${f.name}${count > 1 ? ` ×${count}` : ''}</button>`;
  }).join('');

  const selFood = sel && !sel.startsWith('supp_') ? FOODS.find(f => f.id === sel) : null;
  const qtyRowHtml = selFood ? `
    <div class="micro-quantity-row">
      <span class="micro-qty-food">${selFood.emoji} ${selFood.name}</span>
      <div class="micro-qty-inputs">
        <input type="number" id="micro-qty-amount" class="qty-input" value="100" min="1" max="9999" step="1">
        <select id="micro-qty-unit" class="qty-unit-select">
          <option value="1" selected>g</option>
          <option value="100">× 100g</option>
        </select>
        <button class="btn-sm btn-primary" onclick="addMicroFood()">Add</button>
        <button class="btn-sm" onclick="selectMicroFood(null)" style="padding:4px 8px">✕</button>
      </div>
    </div>` : '';

  const foodLogHtml = foodEntries.length ? `
    <div class="micro-log-list">
      ${foodEntries.map(l => {
        const f = FOODS.find(f => f.id === l.food);
        if (!f) return '';
        return `<div class="micro-log-entry">
          <span class="micro-log-left">${f.emoji} <strong>${f.name}</strong> — ${parseFloat(l.grams || 100)}g</span>
          <button class="micro-log-del" onclick="removeMicroLog('${l.id}')">✕</button>
        </div>`;
      }).join('')}
    </div>` : '';

  const suppChips = SUPPLEMENTS.map(s => {
    const isLogged = loggedSuppIds.includes(s.id);
    return `<button class="food-chip supp-chip${isLogged ? ' logged' : ''}" onclick="toggleFood('${s.id}')">${s.emoji} ${s.name} <span class="supp-serving">${s.serving}</span></button>`;
  }).join('');

  const viewTabs = ['daily','weekly','sauna'].map(v => `
    <button class="micros-view-tab${state.microsTab === v ? ' active' : ''}" data-view="${v}" onclick="switchMicrosView('${v}')">
      ${v.charAt(0).toUpperCase() + v.slice(1)}
    </button>`).join('');

  const saunaAlertHtml = renderSaunaAlert(microDate, dayLogs);

  main.innerHTML = `
    ${saunaAlertHtml}
    <div class="card">
      <div class="card-header">
        <h3>Foods Eaten</h3>
        <input type="date" id="micro-date" class="date-picker-sm" value="${microDate}" onchange="renderMicroContent()">
      </div>
      <div class="food-chips">${foodChips}</div>
      ${qtyRowHtml}
      ${foodLogHtml}
    </div>
    <div class="card">
      <div class="card-header"><h3>Supplements Taken</h3></div>
      <div class="food-chips">${suppChips}</div>
    </div>
    <div class="micros-view-tabs">${viewTabs}</div>
    ${renderNutrientGrid(dayLogs)}`;
}

function renderSaunaAlert(date, dayLogs) {
  if (!state.saunaLogs) return '';
  const hadSauna = state.saunaLogs.some(l => l.date === date && l.protocol !== 'foundation');
  if (!hadSauna) return '';

  const amts = getTotalNutrientAmounts(dayLogs);
  const saunaNutrients = MICRONUTRIENTS.filter(n => n.sauna);

  const withPct = saunaNutrients.map(n => ({
    n,
    pct: n.rda > 0 ? Math.min(100, Math.round(((amts[n.id] || 0) / n.rda) * 100)) : 0,
  })).sort((a, b) => a.pct - b.pct);

  const focusOn  = withPct.filter(x => x.pct < 50);
  const lookGood = withPct.filter(x => x.pct >= 50);

  const focusTags = focusOn.map(x =>
    `<span class="sauna-alert-tag focus">${shortNutrientName(x.n)} <em>${x.pct}%</em></span>`
  ).join('');
  const goodTags = lookGood.map(x =>
    `<span class="sauna-alert-tag good">${shortNutrientName(x.n)} <em>${x.pct}%</em></span>`
  ).join('');

  return `
    <div class="sauna-alert-card">
      <div class="sauna-alert-title">🔥 Sauna day — replenish checklist</div>
      ${focusOn.length ? `<div class="sauna-alert-section"><span class="sauna-alert-label">Focus on</span><div class="sauna-alert-tags">${focusTags}</div></div>` : ''}
      ${lookGood.length ? `<div class="sauna-alert-section"><span class="sauna-alert-label">Looking good</span><div class="sauna-alert-tags">${goodTags}</div></div>` : ''}
    </div>`;
}

function renderNutrientGrid(dayLogs) {
  const view = state.microsTab;
  let nutrients, weekData = null, weekLogs = [];
  if (view === 'weekly') {
    weekData = getWeeklyNutrientCoverage();
    nutrients = MICRONUTRIENTS;
    const today = todayStr();
    const dow = (new Date().getDay() + 6) % 7;
    const weekStart = addDays(today, -dow);
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    weekLogs = state.microLogs.filter(l => weekDates.includes(l.date));
  } else if (view === 'sauna') {
    nutrients = MICRONUTRIENTS.filter(n => n.sauna);
  } else {
    nutrients = MICRONUTRIENTS.filter(n => n.cat === 'daily');
  }

  const todayAmounts = getTotalNutrientAmounts(dayLogs);
  const sourceLogs = view === 'weekly' ? weekLogs : dayLogs;

  // Sauna deductions (daily + sauna views only)
  const microDate = (() => { const el = document.getElementById('micro-date'); return el?.value || todayStr(); })();
  const saunaCount = view !== 'weekly'
    ? (state.saunaLogs || []).filter(l => l.date === microDate && l.protocol !== 'foundation').length
    : 0;

  const cards = nutrients.map(n => {
    let cardClass = '', barColor = '', statusHtml = '';
    if (view === 'weekly' && weekData) {
      const avgAmt = weekData.avgAmounts[n.id] || 0;
      const pct = n.rda > 0 ? Math.min(100, Math.round((avgAmt / n.rda) * 100)) : 0;
      if (pct >= 80) { cardClass = 'covered'; barColor = 'var(--micros)'; }
      else if (pct >= 40) { cardClass = 'partial'; barColor = 'var(--warning)'; }
      else { barColor = 'var(--danger)'; }
      const covDays = weekData.coveredDays[n.id] || 0;
      statusHtml = `
        <div class="nutrient-amt">${formatNutrientAmt(avgAmt, n.unit)} avg / ${n.rda} ${n.unit} RDA</div>
        <div class="nutrient-bar-wrap"><div class="nutrient-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="nutrient-status">${pct}% · ${covDays}/${weekData.totalDays}d ≥50% RDA</div>`;
    } else {
      const rawAmt  = todayAmounts[n.id] || 0;
      const lossAmt = saunaCount > 0 ? (SAUNA_LOSSES[n.id] || 0) * saunaCount : 0;
      const netAmt  = Math.max(0, rawAmt - lossAmt);
      const netPct  = n.rda > 0 ? Math.min(100, Math.round((netAmt  / n.rda) * 100)) : 0;
      const lossPct = n.rda > 0 ? Math.min(100 - netPct, Math.round((Math.min(lossAmt, rawAmt) / n.rda) * 100)) : 0;
      if (netPct >= 80) { cardClass = 'covered'; barColor = 'var(--micros)'; }
      else if (netPct >= 40) { cardClass = 'partial'; barColor = 'var(--warning)'; }
      else { barColor = 'var(--danger)'; }
      const lossLine = lossAmt > 0
        ? `<div class="sauna-loss-line">🔥 −${formatNutrientAmt(lossAmt, n.unit)} sauna</div>`
        : '';
      statusHtml = `
        <div class="nutrient-amt">${formatNutrientAmt(netAmt, n.unit)} / ${n.rda} ${n.unit} RDA${lossAmt > 0 ? ` (logged ${formatNutrientAmt(rawAmt, n.unit)})` : ''}</div>
        <div class="nutrient-bar-wrap">
          <div class="nutrient-bar-fill" style="width:${netPct}%;background:${barColor}"></div>
          ${lossPct > 0 ? `<div class="nutrient-bar-loss" style="width:${lossPct}%"></div>` : ''}
        </div>
        ${lossLine}`;
    }
    const contributors = getTopContributors(n.id, sourceLogs);
    const sourcesHtml = contributors.length
      ? `<div class="nutrient-sources">${contributors.join(' ')}</div>`
      : '';
    return `
      <div class="nutrient-card ${cardClass}">
        <div class="nutrient-card-top">
          <span class="nutrient-name">${n.name}</span>
          <button class="nutrient-info-btn" onclick="toggleNutrientDesc('${n.id}')">ⓘ</button>
        </div>
        ${statusHtml}
        ${sourcesHtml}
        <div class="nutrient-desc hidden" id="nd-${n.id}">${n.desc}</div>
      </div>`;
  }).join('');

  const title = view === 'sauna' ? 'Sauna Recovery' : view === 'weekly' ? 'This Week' : 'Today';
  const gridHtml = `<div class="card"><div class="card-header"><h3>${title}</h3></div><div class="nutrient-grid">${cards}</div></div>`;
  return view === 'weekly' ? gridHtml + renderWeekDayLog() : gridHtml;
}

function getTopContributors(nutrientId, logs, maxCount = 4) {
  const byFood = new Map();
  logs.forEach(l => {
    const grams = parseFloat(l.grams || 100);
    let contrib = 0, emoji = '';
    if (l.food.startsWith('supp_')) {
      const supp = SUPPLEMENTS.find(s => s.id === l.food);
      if (supp && supp.amounts[nutrientId]) { contrib = supp.amounts[nutrientId] * grams; emoji = supp.emoji; }
    } else {
      const food = FOODS.find(f => f.id === l.food);
      if (food && (food.per100g[nutrientId] || 0) > 0) { contrib = food.per100g[nutrientId] * (grams / 100); emoji = food.emoji; }
    }
    if (contrib > 0) {
      const cur = byFood.get(l.food) || { emoji, total: 0 };
      byFood.set(l.food, { emoji, total: cur.total + contrib });
    }
  });
  return [...byFood.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, maxCount)
    .map(x => x.emoji);
}

function shortNutrientName(n) {
  return n.name.replace('Vitamin ', 'Vit ').replace(' (B9)', '').replace('Omega-3', 'Ω-3');
}

function renderWeekDayLog() {
  const today = todayStr();
  const dow = (new Date().getDay() + 6) % 7;
  const weekStart = addDays(today, -dow);
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dailyNutrients = MICRONUTRIENTS.filter(n => n.cat === 'daily');
  const total = dailyNutrients.length;

  const rows = dayNames.map((name, i) => {
    const date = addDays(weekStart, i);
    if (date > today) {
      return `<div class="day-log-row future"><div class="day-log-header"><span class="day-log-name">${name}</span><span class="day-log-pct" style="color:var(--text-muted)">—</span></div></div>`;
    }
    const logs = state.microLogs.filter(l => l.date === date);
    const amts = getTotalNutrientAmounts(logs);
    const covered = dailyNutrients.filter(n => n.rda > 0 && (amts[n.id] || 0) >= n.rda * 0.5);
    const missing  = dailyNutrients.filter(n => !(n.rda > 0 && (amts[n.id] || 0) >= n.rda * 0.5));
    const pct = logs.length ? Math.round((covered.length / total) * 100) : null;
    const pctColor = pct === null ? 'var(--text-muted)' : pct >= 80 ? 'var(--micros)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    return `
      <div class="day-log-row">
        <div class="day-log-header">
          <span class="day-log-name">${name}</span>
          <span class="day-log-pct" style="color:${pctColor}">${pct !== null ? pct+'%' : '—'}</span>
        </div>
        ${logs.length ? `<div class="day-log-tags">
          ${covered.map(n => `<span class="day-log-tag covered">${shortNutrientName(n)}</span>`).join('')}
          ${missing.map(n  => `<span class="day-log-tag missing">${shortNutrientName(n)}</span>`).join('')}
        </div>` : '<div style="font-size:0.72rem;color:var(--text-muted)">Nothing logged</div>'}
      </div>`;
  }).join('');

  return `<div class="card" style="margin-top:0"><div class="card-header"><h3>Daily Breakdown</h3></div><div class="day-log">${rows}</div></div>`;
}

function getWeeklyNutrientCoverage() {
  const today = todayStr();
  const dow = (new Date().getDay() + 6) % 7;
  const weekStart = addDays(today, -dow);
  const pastDates = Array.from({ length: dow + 1 }, (_, i) => addDays(weekStart, i));

  const sumAmounts = {};
  const coveredDays = {};
  MICRONUTRIENTS.forEach(n => { sumAmounts[n.id] = 0; coveredDays[n.id] = 0; });

  pastDates.forEach(date => {
    const logs = state.microLogs.filter(l => l.date === date);
    const amts = getTotalNutrientAmounts(logs);
    MICRONUTRIENTS.forEach(n => {
      sumAmounts[n.id] += amts[n.id] || 0;
      if (n.rda > 0 && (amts[n.id] || 0) >= n.rda * 0.5) coveredDays[n.id]++;
    });
  });

  const avgAmounts = {};
  MICRONUTRIENTS.forEach(n => {
    avgAmounts[n.id] = pastDates.length > 0 ? sumAmounts[n.id] / pastDates.length : 0;
  });

  return { avgAmounts, coveredDays, totalDays: pastDates.length };
}

function toggleNutrientDesc(id) {
  const el = document.getElementById('nd-' + id);
  if (el) el.classList.toggle('hidden');
}

function selectMicroFood(foodId) {
  state.selectedMicroFood = foodId;
  renderMicroContent();
}

async function addMicroFood() {
  const foodId = state.selectedMicroFood;
  if (!foodId) return;
  const dateEl = document.getElementById('micro-date');
  const date = (dateEl && dateEl.value) ? dateEl.value : todayStr();
  const amountEl = document.getElementById('micro-qty-amount');
  const unitEl = document.getElementById('micro-qty-unit');
  const amount = parseFloat(amountEl?.value || 100);
  const multiplier = parseFloat(unitEl?.value || 1);
  const grams = amount * multiplier;
  if (!grams || grams <= 0) { showToast('Enter a valid amount', 'error'); return; }

  const { data, error } = await db.from('micro_logs').insert({ date, food: foodId, grams }).select().single();
  if (error) { showToast('Failed to log food', 'error'); return; }
  state.microLogs.push(data);
  state.selectedMicroFood = null;
  renderMicroContent();
}

async function removeMicroLog(logId) {
  const { error } = await db.from('micro_logs').delete().eq('id', logId);
  if (error) { showToast('Failed to remove entry', 'error'); return; }
  state.microLogs = state.microLogs.filter(l => l.id !== logId);
  renderMicroContent();
}

async function toggleFood(foodId) {
  const dateEl = document.getElementById('micro-date');
  const date = (dateEl && dateEl.value) ? dateEl.value : todayStr();
  const existing = state.microLogs.find(l => l.date === date && l.food === foodId);
  if (existing) {
    await db.from('micro_logs').delete().eq('id', existing.id);
    state.microLogs = state.microLogs.filter(l => l.id !== existing.id);
  } else {
    const { data, error } = await db.from('micro_logs').insert({ date, food: foodId, grams: 1 }).select().single();
    if (error) { showToast('Failed to log supplement', 'error'); return; }
    state.microLogs.push(data);
  }
  renderMicroContent();
}

async function retryMicrosLoad() {
  const { data, error } = await db.from('micro_logs').select('*').order('date', { ascending: false });
  if (error) { showToast('micro_logs table not found — run the SQL first', 'error'); return; }
  state.microLogs = data || [];
  renderMicroTab();
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
  renderTodos();
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
      <div class="today-stat-label">${target ? 'Target: '+target : 'Calories'}${todayNutrition ? ' · '+todayNutrition.protein+'g P' : ''}</div>
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
  const saunaThisWeek = (state.saunaLogs || []).filter(l => l.protocol !== 'foundation' && weekDates.includes(l.date)).length;
  const weekProtein = weekNutrition.length ? Math.round(weekNutrition.reduce((s, l) => s + parseFloat(l.protein || 0), 0) / weekNutrition.length) : null;
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
    <div class="week-digest-card card">
      <div class="digest-icon">🔥</div>
      <div class="digest-value">${saunaThisWeek || '—'}</div>
      <div class="digest-label-text">Sauna sessions</div>
    </div>
    <div class="week-digest-card card">
      <div class="digest-icon">🥩</div>
      <div class="digest-value">${weekProtein ? weekProtein+'g' : '—'}</div>
      <div class="digest-label-text">Avg protein</div>
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
// TO-DO LIST
// ==========================================

function renderTodos() {
  const list = document.getElementById('todo-list');
  if (!list) return;
  const open = state.todos.filter(t => !t.completed);
  const done = state.todos.filter(t => t.completed);
  const sorted = [...open, ...done];
  if (!sorted.length) {
    list.innerHTML = '<div class="todo-empty">No tasks — add one above</div>';
    return;
  }
  list.innerHTML = sorted.map(t => `
    <div class="todo-item">
      <button class="todo-checkbox ${t.completed ? 'done' : ''}" onclick="toggleTodo('${t.id}',${t.completed})">${t.completed ? '✓' : ''}</button>
      <span class="todo-text ${t.completed ? 'done' : ''}">${t.text}</span>
      <button class="todo-delete" onclick="deleteTodo('${t.id}')" title="Delete">✕</button>
    </div>
  `).join('');
}

async function addTodo() {
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!text) return;
  const { data, error } = await db.from('todos').insert({ text, completed: false }).select().single();
  if (error) { showToast('Failed to add task', 'error'); return; }
  state.todos.push(data);
  input.value = '';
  renderTodos();
}

async function toggleTodo(id, currentlyDone) {
  const completed = !currentlyDone;
  await db.from('todos').update({ completed }).eq('id', id);
  const todo = state.todos.find(t => t.id === id);
  if (todo) todo.completed = completed;
  renderTodos();
}

async function deleteTodo(id) {
  await db.from('todos').delete().eq('id', id);
  state.todos = state.todos.filter(t => t.id !== id);
  renderTodos();
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
