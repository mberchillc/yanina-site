CREATE TABLE IF NOT EXISTS student_nutrition_plans (
  student_id INTEGER PRIMARY KEY,
  general_goal TEXT NOT NULL DEFAULT '',
  monthly_goal TEXT NOT NULL DEFAULT '',
  water_target INTEGER NOT NULL DEFAULT 8,
  vegetables_target INTEGER NOT NULL DEFAULT 3,
  protein_target INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_nutrition_habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  habit_date TEXT NOT NULL,
  water_glasses INTEGER NOT NULL DEFAULT 0,
  vegetables_meals INTEGER NOT NULL DEFAULT 0,
  protein_meals INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, habit_date)
);

CREATE TABLE IF NOT EXISTS student_nutrition_meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  photo_key TEXT NOT NULL,
  photo_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'pending',
  trainer_comment TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, meal_date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_student_nutrition_meals_week
ON student_nutrition_meals(student_id, meal_date);
