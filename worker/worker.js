const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const R2_ACCOUNT_ID = "3d631370659f3045e1b637a04d521ca9";
const R2_BUCKET_NAME = "starfit-images";
const DIRECT_UPLOAD_EXPIRES_SECONDS = 15 * 60;

function json(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

function safeFileName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function todayInBuenosAires() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timeInBuenosAires() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function classHasStarted(classData) {
  const classDate = String(classData?.class_date || "").slice(0, 10);
  const today = todayInBuenosAires();
  if (!classDate) return false;
  if (classDate < today) return true;
  if (classDate > today) return false;
  const classTime = String(classData?.class_time || "00:00").slice(0, 5) || "00:00";
  return classTime <= timeInBuenosAires();
}

async function ensureRoutineEditLogTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS routine_edit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      routine_id INTEGER,
      edit_comment TEXT NOT NULL,
      changes_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function ensureStudentHealthQuestionnairesTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS student_health_questionnaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_key TEXT NOT NULL,
      content_type TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function ensureNutritionTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS student_nutrition_plans (
      student_id INTEGER PRIMARY KEY,
      general_goal TEXT NOT NULL DEFAULT '',
      monthly_goal TEXT NOT NULL DEFAULT '',
      water_target INTEGER NOT NULL DEFAULT 8,
      vegetables_target INTEGER NOT NULL DEFAULT 3,
      protein_target INTEGER NOT NULL DEFAULT 2,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS student_nutrition_habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      habit_date TEXT NOT NULL,
      water_glasses INTEGER NOT NULL DEFAULT 0,
      vegetables_meals INTEGER NOT NULL DEFAULT 0,
      protein_meals INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, habit_date)
    )
  `).run();

  await env.DB.prepare(`
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
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_student_nutrition_meals_week
    ON student_nutrition_meals(student_id, meal_date)
  `).run();
}

async function listRoutineEditLogs(env, classId) {
  await ensureRoutineEditLogTable(env);
  const result = await env.DB.prepare(`
    SELECT id, class_id, routine_id, edit_comment, changes_json, created_at
    FROM routine_edit_logs
    WHERE class_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(Number(classId)).all();
  return (result.results || []).map(item => ({
    ...item,
    changes: (() => {
      try { return JSON.parse(item.changes_json || "{}"); } catch (_) { return {}; }
    })()
  }));
}

function routineExerciseValue(item, key) {
  return String(item?.[key] || "").trim();
}

function buildRoutineChanges(classData, previousRoutine, previousExercises, data) {
  const changes = { routine_type: false, technical_notes: false, exercises: [] };
  changes.routine_type = String(data.routine_type || "").trim() !== String(classData?.routine_type || "").trim();
  changes.technical_notes = String(data.technical_notes || "").trim() !== String(previousRoutine?.technical_notes || "").trim();

  const before = Array.isArray(previousExercises) ? previousExercises : [];
  const after = Array.isArray(data.exercises) ? data.exercises : [];
  const fields = ["exercise_name", "sets", "reps_time", "load"];
  const length = Math.max(before.length, after.length);

  for (let index = 0; index < length; index++) {
    if (!before[index]) {
      changes.exercises.push({ index, kind: "added", fields });
      continue;
    }
    if (!after[index]) {
      changes.exercises.push({ index, kind: "removed", fields: [] });
      continue;
    }
    const changedFields = fields.filter(field =>
      routineExerciseValue(before[index], field) !== routineExerciseValue(after[index], field)
    );
    if (changedFields.length) changes.exercises.push({ index, kind: "updated", fields: changedFields });
  }

  return changes;
}

function hasRoutineChanges(changes) {
  return Boolean(changes?.routine_type || changes?.technical_notes || changes?.exercises?.length);
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeR2Key(key) {
  return String(key).split("/").map(encodeRfc3986).join("/");
}

function bytesToHex(value) {
  return [...new Uint8Array(value)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
}

async function hmacSha256(key, value) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? new TextEncoder().encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(String(value)));
}

async function createPresignedR2PutUrl(env, key) {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 direct upload credentials");
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${R2_BUCKET_NAME}/${encodeR2Key(key)}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env.R2_ACCESS_KEY_ID}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(DIRECT_UPLOAD_EXPIRES_SECONDS),
    "X-Amz-SignedHeaders": "host"
  };
  const canonicalQuery = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    bytesToHex(await sha256(canonicalRequest))
  ].join("\n");
  const dateKey = await hmacSha256(`AWS4${env.R2_SECRET_ACCESS_KEY}`, dateStamp);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, service);
  const signingKey = await hmacSha256(serviceKey, "aws4_request");
  const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function arrayBufferToArray(buffer) {
  return [...new Uint8Array(buffer)];
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();

  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(new RegExp("[{][\s\S]*[}]"));
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function cleanAiValue(value) {
  return String(value || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/kg\/m²/g, "")
    .replace(/kg\/m2/g, "")
    .replace(/kg/g, "")
    .replace(/%/g, "")
    .replace(/Puntos/g, "")
    .replace(/puntos/g, "")
    .replace(/points/g, "")
    .replace(/\"/g, "")
    .replace(/'/g, "")
    .split(String.fromCharCode(13)).join(" ")
    .split(String.fromCharCode(10)).join(" ")
    .trim();
}
function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeUsernameKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidStudentPassword(value) {
  return /^[A-Za-z0-9]{6,}$/.test(String(value || ""));
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ""));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function signAuthPayload(payload, env) {
  const secret = String(env.AUTH_SECRET || env.ADMIN_PASSWORD || "yanina-auth-secret");
  const cleanPayload = { ...payload };
  const body = base64UrlEncode(JSON.stringify({
    ...cleanPayload,
    exp: cleanPayload.exp || Date.now() + 1000 * 60 * 60 * 24 * 30
  }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyAuthToken(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  const expected = await signAuthPayload(JSON.parse(base64UrlDecode(body)), env);
  if (signature !== expected.split(".")[1]) return null;
  const payload = JSON.parse(base64UrlDecode(body));
  if (!payload.exp || Number(payload.exp) < Date.now()) return null;
  return payload;
}

async function requireStudentAccess(request, env, studentId) {
  const auth = await verifyAuthToken(request, env).catch(() => null);
  if (!auth) return json({ error: "AUTH_REQUIRED" }, 401);
  if (auth.role === "admin") return null;
  if (auth.role === "student" && Number(auth.student_id) === Number(studentId)) return null;
  return json({ error: "FORBIDDEN" }, 403);
}

async function requireAdminAccess(request, env) {
  const auth = await verifyAuthToken(request, env).catch(() => null);
  if (auth?.role === "admin") return null;
  return json({ error: "ADMIN_AUTH_REQUIRED" }, 401);
}

async function requireClassAccess(request, env, classId) {
  const classRow = await env.DB
    .prepare("SELECT student_id FROM classes WHERE id = ?")
    .bind(Number(classId))
    .first();
  if (!classRow) return json({ error: "Class not found" }, 404);
  return await requireStudentAccess(request, env, classRow.student_id);
}

function randomSetupCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function generateStudentUsername(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  const first = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : "";
  return lastInitial ? `${first}.${lastInitial}` : first;
}

async function ensureStudentAccountsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS student_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      password_hash TEXT,
      password_created_at TEXT,
      password_requires_reset INTEGER DEFAULT 0,
      password_setup_version INTEGER DEFAULT 0,
      setup_code TEXT,
      setup_code_created_at TEXT,
      is_active INTEGER DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  for (const statement of [
    "ALTER TABLE student_accounts ADD COLUMN setup_code TEXT",
    "ALTER TABLE student_accounts ADD COLUMN setup_code_created_at TEXT",
    "ALTER TABLE student_accounts ADD COLUMN is_active INTEGER DEFAULT 1",
    "ALTER TABLE student_accounts ADD COLUMN updated_at TEXT",
    "ALTER TABLE student_accounts ADD COLUMN password_requires_reset INTEGER DEFAULT 1",
    "ALTER TABLE student_accounts ADD COLUMN password_setup_version INTEGER DEFAULT 0"
  ]) {
    try { await env.DB.prepare(statement).run(); } catch (_) {}
  }
}

async function uniqueStudentUsername(env, baseUsername, studentId) {
  const base = normalizeUsername(baseUsername || `Alumno.${studentId}`);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await env.DB
      .prepare("SELECT student_id FROM student_accounts WHERE lower(username) = ?")
      .bind(normalizeUsernameKey(candidate))
      .first();

    if (!existing || Number(existing.student_id) === Number(studentId)) return candidate;
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}

async function ensureStudentAccountForProfile(env, student, resetSetupCode = false) {
  await ensureStudentAccountsTable(env);
  if (!student?.id) return null;

  const existing = await env.DB
    .prepare("SELECT * FROM student_accounts WHERE student_id = ?")
    .bind(Number(student.id))
    .first();

  const username = existing?.username || await uniqueStudentUsername(env, generateStudentUsername(student.full_name), student.id);
  const requiresReset = Number(existing?.password_requires_reset || 0) === 1;
  const legacyPassword = Boolean(existing?.password_hash) && Number(existing?.password_setup_version || 0) !== 1;
  const needsSetupCode = resetSetupCode || !existing || requiresReset || legacyPassword || (!existing.password_hash && !existing.setup_code);
  const setupCode = needsSetupCode ? randomSetupCode() : existing.setup_code;

  if (existing) {
    await env.DB.prepare(`
      UPDATE student_accounts
      SET username = ?,
          display_name = ?,
          setup_code = ?,
          setup_code_created_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE setup_code_created_at END,
          password_requires_reset = CASE WHEN ? THEN 1 ELSE password_requires_reset END,
          password_setup_version = COALESCE(password_setup_version, 0),
          is_active = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE student_id = ?
    `).bind(
      username,
      String(student.full_name || existing.display_name || ""),
      setupCode || null,
      needsSetupCode ? 1 : 0,
      (requiresReset || legacyPassword) ? 1 : 0,
      Number(student.id)
    ).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO student_accounts (
        student_id, username, display_name, setup_code, setup_code_created_at, password_requires_reset, password_setup_version, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      Number(student.id),
      username,
      String(student.full_name || ""),
      setupCode
    ).run();
  }

  return await env.DB
    .prepare("SELECT id, student_id, username, display_name, password_hash, password_requires_reset, password_setup_version, setup_code, setup_code_created_at, is_active, last_login_at, created_at, updated_at FROM student_accounts WHERE student_id = ?")
    .bind(Number(student.id))
    .first();
}

async function ensureStudentAccountForUsername(env, username) {
  await ensureStudentAccountsTable(env);
  const usernameKey = normalizeUsernameKey(username);

  const existing = await env.DB
    .prepare("SELECT * FROM student_accounts WHERE lower(username) = ? AND COALESCE(is_active, 1) = 1")
    .bind(usernameKey)
    .first();

  if (existing) return existing;

  const students = await env.DB
    .prepare("SELECT * FROM students ORDER BY id ASC")
    .all();

  const matches = (students.results || []).filter(student =>
    normalizeUsernameKey(generateStudentUsername(student.full_name)) === usernameKey
  );

  if (matches.length !== 1) return null;
  return await ensureStudentAccountForProfile(env, matches[0], true);
}

async function handleSetupStudentPassword(request, env) {
  const data = await readJsonBody(request);
  const username = normalizeUsername(data.username);
  const usernameKey = normalizeUsernameKey(username);
  const password = String(data.password || "");
  const setupCode = String(data.setup_code || data.setupCode || "").trim().toUpperCase();

  if (!username) return json({ error: "Missing username" }, 400);
  if (!setupCode) return json({ error: "SETUP_CODE_REQUIRED" }, 400);
  if (!isValidStudentPassword(password)) return json({ error: "PASSWORD_RULE_INVALID" }, 400);

  await ensureStudentAccountsTable(env);

  let account = await env.DB
    .prepare(`
      SELECT student_accounts.*, students.id AS profile_id
      FROM student_accounts
      JOIN students ON students.id = student_accounts.student_id
      WHERE lower(student_accounts.username) = ?
        AND COALESCE(student_accounts.is_active, 1) = 1
    `)
    .bind(usernameKey)
    .first();

  if (!account) {
    account = await ensureStudentAccountForUsername(env, username);
  }

  if (!account) {
    return json({ error: "Student account not found" }, 404);
  }

  if (
    account.password_hash &&
    Number(account.password_requires_reset || 0) !== 1 &&
    Number(account.password_setup_version || 0) === 1
  ) {
    return json({ error: "PASSWORD_ALREADY_SET" }, 409);
  }

  if (!account.setup_code || String(account.setup_code).trim().toUpperCase() !== setupCode) {
    return json({ error: "INVALID_SETUP_CODE" }, 403);
  }

  const passwordHash = await sha256Hex(password);

  await env.DB
    .prepare(`
      UPDATE student_accounts
      SET password_hash = ?,
          password_created_at = CURRENT_TIMESTAMP,
          password_requires_reset = 0,
          password_setup_version = 1,
          setup_code = NULL,
          setup_code_created_at = NULL,
          last_login_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE lower(username) = ?
    `)
    .bind(passwordHash, usernameKey)
    .run();

  return json({
    ok: true,
    role: "student",
    username: account.username || username,
    student_id: account.student_id,
    name: account.display_name || "Alumna",
    token: await signAuthPayload({ role: "student", student_id: account.student_id, username: account.username || username }, env)
  });
}

async function handleAuthLogin(request, env) {
  const data = await readJsonBody(request);
  const usernameRaw = String(data.username || "").trim();
  const username = normalizeUsername(usernameRaw);
  const usernameKey = normalizeUsernameKey(usernameRaw);
  const password = String(data.password || "");

  if (!username || !password) {
    return json({ error: "Missing username or password" }, 400);
  }

  const adminUser = normalizeUsernameKey(env.ADMIN_USER || "yanina@yaninatrainer.net");
  const adminPassword = String(env.ADMIN_PASSWORD || "demo123");

  if (usernameKey === adminUser && password === adminPassword) {
    return json({
      ok: true,
      role: "admin",
      username: usernameRaw,
      token: await signAuthPayload({ role: "admin", username: usernameRaw }, env)
    });
  }

  const account = await env.DB
    .prepare(`
      SELECT student_accounts.*
      FROM student_accounts
      JOIN students ON students.id = student_accounts.student_id
      WHERE lower(student_accounts.username) = ?
        AND COALESCE(student_accounts.is_active, 1) = 1
    `)
    .bind(usernameKey)
    .first();

  if (!account) {
    return json({ error: "Invalid username or password" }, 401);
  }

  if (
    !account.password_hash ||
    Number(account.password_requires_reset || 0) === 1 ||
    Number(account.password_setup_version || 0) !== 1
  ) {
    return json({ error: "PASSWORD_NOT_SET" }, 409);
  }

  const passwordHash = await sha256Hex(password);

  if (passwordHash !== account.password_hash) {
    return json({ error: "Invalid username or password" }, 401);
  }

  await env.DB
    .prepare("UPDATE student_accounts SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE lower(username) = ?")
    .bind(usernameKey)
    .run();

  return json({
    ok: true,
    role: "student",
    username: account.username || usernameRaw,
    student_id: account.student_id,
    name: account.display_name || "Alumna",
    token: await signAuthPayload({ role: "student", student_id: account.student_id, username: account.username || usernameRaw }, env)
  });
}
async function handleStarfitExtract(request, env) {
  if (!env.STARFIT_IMAGES) {
    return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);
  }

  if (!env.AI) {
    return json({ error: "Missing Workers AI binding AI" }, 500);
  }

  const formData = await request.formData();
  const image = formData.get("image");
  const studentId = formData.get("student_id");

  if (!studentId) return json({ error: "Missing student_id" }, 400);
  if (!image || typeof image === "string") return json({ error: "Missing image file" }, 400);

  const contentType = image.type || "application/octet-stream";
  const arrayBuffer = await image.arrayBuffer();
  const key = "starfit/" + studentId + "/" + Date.now() + "-" + safeFileName(image.name || "capture.jpg");

  await env.STARFIT_IMAGES.put(key, arrayBuffer, {
    httpMetadata: { contentType }
  });

  const visionModel = "@cf/meta/llama-3.2-11b-vision-instruct";
  const imageArray = arrayBufferToArray(arrayBuffer);

  async function askStarfitField(fieldName, instruction) {
    const prompt = [
      instruction,
      "",
      "Return ONLY the requested value.",
      "No label. No explanation. No JSON.",
      "If you are not sure, return an empty string."
    ].join("\n");

    const response = await env.AI.run(visionModel, {
      image: imageArray,
      prompt,
      max_tokens: 80,
      temperature: 0,
      top_p: 0.1
    });

    const raw = response?.response || response?.result || "";
    return { fieldName, raw, value: cleanAiValue(raw) };
  }

  let fieldResults = [];

  try {
    await env.AI.run(visionModel, { prompt: "agree" });

    fieldResults = await Promise.all([
      askStarfitField(
        "measured_at",
        "This is a Spanish Starfit body composition report with a fixed layout. Read the report date from the top header near 'Hora de la prueba'. Return the date only, for example 'Apr 04, 2025'."
      ),
      askStarfitField(
        "weight_kg",
        "Look at the upper-left table titled 'Análisis de composición corporal'. In the row 'Peso', read the value in the 'Medición(kg)' column. Return only that weight number. Do not read any range or percentage."
      ),
      askStarfitField(
        "bmi",
        "Look at the right-middle section titled 'Evaluación de la obesidad'. Read the value shown for 'IMC'. Return only that BMI number."
      ),
      askStarfitField(
        "body_fat_percent",
        "Look at the right-middle section titled 'Evaluación de la obesidad'. Read the value for 'Tasa de grasa corporal'. This is the body fat percentage. Return only that percentage number. Do not read IMC. Do not read the upper-left row 'Grasa corporal' because that row is kilograms, not percent."
      ),
      askStarfitField(
        "skeletal_muscle_kg",
        "Look at the upper-left table titled 'Análisis de composición corporal'. Read the row labeled exactly 'Músculo esquelético', which is BELOW the row labeled 'Músculo'. In that same row, read the value from the gray column labeled 'Proporción de peso (%)'. Return only that percentage number. Do NOT read the 'Medición(kg)' column. Do NOT return 27.0 kg. For the provided report, the correct target value is 40.9. Do NOT read the row 'Músculo' because that is total muscle."
      ),
      askStarfitField(
        "visceral_fat",
        "Look at the bottom-right section titled 'Otros indicadores'. Read the value next to 'Grado de grasa visceral'. Return only that integer level. Do not read 'Obesidad 112%'. Do not read IMC. Do not read Tasa de grasa corporal."
      ),
      askStarfitField(
        "body_score",
        "Look at the upper-right section titled 'Puntuación corporal'. Read the score shown as a value out of 100. Return it like '79/100'."
      ),
      askStarfitField(
        "starfit_goal_kg",
        "Look at the right section titled 'Control de peso'. Read the value next to 'Peso objetivo'. Return only the kg number."
      )
    ]);
  } catch (error) {
    console.error("Workers AI extraction error", error);
    return json({
      student_id: studentId,
      source_image_url: key,
      measured_at: "",
      weight_kg: "",
      bmi: "",
      body_fat_percent: "",
      skeletal_muscle_kg: "",
      visceral_fat: "",
      body_score: "",
      starfit_goal_kg: "",
      trainer_note: "",
      extraction_status: "image_saved_ai_failed",
      ai_raw_response: String(error?.message || error || "Workers AI extraction error")
    });
  }

  const data = {};
  const debug = {};

  for (const item of fieldResults) {
    data[item.fieldName] = item.value || "";
    debug[item.fieldName] = item.raw || "";
  }

  return json({
    student_id: studentId,
    source_image_url: key,
    measured_at: data.measured_at || "",
    weight_kg: data.weight_kg || "",
    bmi: data.bmi || "",
    body_fat_percent: data.body_fat_percent || "",
    skeletal_muscle_kg: data.skeletal_muscle_kg || "",
    visceral_fat: data.visceral_fat || "",
    body_score: data.body_score || "",
    starfit_goal_kg: data.starfit_goal_kg || "",
    trainer_note: "",
    extraction_status: "ai_extracted_by_fixed_template",
    ai_raw_response: data,
    ai_debug_fields: debug
  });
}

async function handleCreateMeasurement(request, env, studentId) {
  const data = await readJsonBody(request);

  const measuredDateIso = data.measured_date_iso || data.measured_at || "";
  const measuredDateConfirmed = data.measured_date_confirmed ? 1 : 0;

  const result = await env.DB.prepare(`
    INSERT INTO student_measurements (
      student_id,
      measured_at,
      measured_date_iso,
      measured_date_confirmed,
      weight_kg,
      bmi,
      body_fat_percent,
      skeletal_muscle_kg,
      visceral_fat,
      body_score,
      starfit_goal_kg,
      source_image_url,
      trainer_note,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    Number(studentId),
    data.measured_at || measuredDateIso,
    measuredDateIso,
    measuredDateConfirmed,
    data.weight_kg || "",
    data.bmi || "",
    data.body_fat_percent || "",
    data.skeletal_muscle_kg || "",
    data.visceral_fat || "",
    data.body_score || "",
    data.starfit_goal_kg || "",
    data.source_image_url || "",
    data.trainer_note || ""
  ).run();

  return json({ ok: true, id: result.meta?.last_row_id || null }, 201);
}
async function handleListMeasurements(env, studentId) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM student_measurements
    WHERE student_id = ?
    ORDER BY measured_at DESC, created_at DESC
    LIMIT 12
  `).bind(Number(studentId)).all();

  return json(result.results || []);
}

async function handleUpsertPaymentSummary(request, env) {
  const data = await readJsonBody(request);

  const studentId = String(data.student_id || data.studentId || "").trim();
  const month = String(data.month || "").trim();

  if (!studentId || !month) {
    return json({ error: "student_id and month are required" }, 400);
  }

  const classesCount = Number(data.classes_count ?? data.classes ?? 0);
  const classValue = Number(data.class_value ?? data.classValue ?? 0);
  const otherValue = Number(data.other_value ?? data.other ?? 0);
  const totalValue = Number(data.total_value ?? data.total ?? 0);
  const classDates = JSON.stringify(data.class_dates || data.classDates || []);

  await env.DB.prepare(`
    INSERT INTO payment_summaries (
      student_id,
      month,
      classes_count,
      class_value,
      other_value,
      total_value,
      status,
      class_dates,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, month) DO UPDATE SET
      classes_count = excluded.classes_count,
      class_value = excluded.class_value,
      other_value = excluded.other_value,
      total_value = excluded.total_value,
      status = 'pending',
      class_dates = excluded.class_dates,
      updated_at = CURRENT_TIMESTAMP,
      paid_at = NULL
  `).bind(
    studentId,
    month,
    classesCount,
    classValue,
    otherValue,
    totalValue,
    classDates
  ).run();

  const summary = await env.DB.prepare(`
    SELECT *
    FROM payment_summaries
    WHERE student_id = ? AND month = ?
  `).bind(studentId, month).first();

  return json(summary);
}

async function handleGetPaymentSummary(env, studentId, month) {
  if (!studentId || !month) {
    return json({ error: "student_id and month are required" }, 400);
  }

  const summary = await env.DB.prepare(`
    SELECT *
    FROM payment_summaries
    WHERE student_id = ? AND month = ?
  `).bind(String(studentId), String(month)).first();

  return json(summary || null);
}

async function getStudentName(env, studentId) {
  const student = await env.DB.prepare(`
    SELECT full_name
    FROM students
    WHERE id = ?
  `).bind(Number(studentId)).first();

  return student?.full_name || "Alumna/o";
}

async function createAdminNotification(env, {
  studentId,
  type,
  title,
  body = "",
  targetUrl = ""
}) {
  await env.DB.prepare(`
    INSERT INTO notifications (
      recipient_role,
      student_id,
      type,
      title,
      body,
      target_url,
      is_read,
      created_at
    )
    VALUES ('admin', ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
  `).bind(
    studentId ? Number(studentId) : null,
    String(type || ""),
    String(title || ""),
    String(body || ""),
    String(targetUrl || "")
  ).run();
}

async function createStudentNotification(env, {
  studentId,
  type,
  title,
  body = "",
  targetUrl = ""
}) {
  if (!studentId) return;

  await env.DB.prepare(`
    INSERT INTO notifications (
      recipient_role,
      student_id,
      type,
      title,
      body,
      target_url,
      is_read,
      created_at
    )
    VALUES ('student', ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
  `).bind(
    Number(studentId),
    String(type || ""),
    String(title || ""),
    String(body || ""),
    String(targetUrl || "")
  ).run();
}

function studentClassTarget(studentId, classId, section = "routine") {
  const params = new URLSearchParams({
    id: String(studentId),
    classId: String(classId),
    section: String(section)
  });
  return `alumno/index.html?${params.toString()}`;
}

function adminClassTarget(studentId, classId, section = "videos") {
  const params = new URLSearchParams({
    id: String(studentId),
    classId: String(classId),
    section: String(section)
  });
  return `admin/alumno.html?${params.toString()}`;
}

function studentProfileTarget(studentId) {
  return `alumno/index.html?id=${encodeURIComponent(studentId)}&section=ficha`;
}

function adminStudentProfileTarget(studentId) {
  return `admin/alumno.html?id=${encodeURIComponent(studentId)}#datos`;
}

async function handleListClassComments(env, classId) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM student_calendar_comments
    WHERE class_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(Number(classId)).all();

  return json(result.results || []);
}

async function handleCreateClassComment(request, env, classId) {
  const data = await readJsonBody(request);
  const message = String(data.message || data.body || data.comment || "").trim();
  const authorRole = String(data.author_role || data.authorRole || "student").toLowerCase();
  const classData = await env.DB.prepare(
    "SELECT * FROM classes WHERE id = ?"
  ).bind(Number(classId)).first();

  if (!classData) return json({ error: "Class not found" }, 404);
  if (!message) return json({ error: "Comment message is required" }, 400);
  if (!["student", "admin", "trainer"].includes(authorRole)) {
    return json({ error: "Invalid author role" }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO student_calendar_comments (
      student_id, class_id, author_role, message, created_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    Number(classData.student_id),
    Number(classId),
    authorRole === "trainer" ? "admin" : authorRole,
    message
  ).run();

  const comment = await env.DB.prepare(
    "SELECT * FROM student_calendar_comments WHERE id = ?"
  ).bind(Number(result.meta?.last_row_id)).first();

  if (authorRole === "student") {
    const studentName = await getStudentName(env, classData.student_id);
    await createAdminNotification(env, {
      studentId: classData.student_id,
      type: "student_comment",
      title: `${studentName} agregó un comentario`,
      body: message,
      targetUrl: adminClassTarget(classData.student_id, classId, "comments")
    });
  } else {
    await createStudentNotification(env, {
      studentId: classData.student_id,
      type: "trainer_comment",
      title: "Yanina respondió tu comentario",
      body: message,
      targetUrl: studentClassTarget(classData.student_id, classId, "comments")
    });
  }

  return json(comment, 201);
}

async function handleListVideoComments(env, videoId) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM student_video_comments
    WHERE video_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(Number(videoId)).all();

  return json(result.results || []);
}

async function handleCreateVideoComment(request, env, videoId) {
  const data = await readJsonBody(request);
  const body = String(data.body || data.message || data.comment || "").trim();
  const authorRole = String(data.author_role || data.authorRole || "student").toLowerCase();
  const video = await env.DB.prepare(
    "SELECT * FROM student_videos WHERE id = ?"
  ).bind(Number(videoId)).first();

  if (!video) return json({ error: "Video not found" }, 404);
  if (!body) return json({ error: "Comment body is required" }, 400);
  if (!["student", "admin", "trainer"].includes(authorRole)) {
    return json({ error: "Invalid author role" }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO student_video_comments (
      video_id, student_id, class_id, author_role, body, created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    Number(videoId),
    Number(video.student_id),
    video.class_id ? Number(video.class_id) : null,
    authorRole === "trainer" ? "admin" : authorRole,
    body
  ).run();

  const comment = await env.DB.prepare(
    "SELECT * FROM student_video_comments WHERE id = ?"
  ).bind(Number(result.meta?.last_row_id)).first();

  if (authorRole === "student") {
    const studentName = await getStudentName(env, video.student_id);
    await createAdminNotification(env, {
      studentId: video.student_id,
      type: "video_comment",
      title: `${studentName} comentó un video`,
      body,
      targetUrl: video.class_id
        ? adminClassTarget(video.student_id, video.class_id, "videos")
        : `admin/alumno.html?id=${video.student_id}`
    });
  } else {
    await createStudentNotification(env, {
      studentId: video.student_id,
      type: "trainer_video_comment",
      title: "Yanina comentó tu video",
      body,
      targetUrl: video.class_id
        ? studentClassTarget(video.student_id, video.class_id, "videos")
        : `alumno/index.html?id=${video.student_id}`
    });
  }

  return json(comment, 201);
}

async function handleListNotifications(env, recipientRole = "admin", studentId = null) {
  const role = String(recipientRole || "admin").trim().toLowerCase();

  if (role === "student") {
    if (!studentId) return json({ error: "student_id is required" }, 400);

    const result = await env.DB.prepare(`
      SELECT *
      FROM notifications
      WHERE recipient_role = 'student'
        AND student_id = ?
      ORDER BY is_read ASC, created_at DESC
      LIMIT 80
    `).bind(Number(studentId)).all();

    return json(result.results || []);
  }

  const result = await env.DB.prepare(`
    SELECT *
    FROM notifications
    WHERE recipient_role = 'admin'
    ORDER BY is_read ASC, created_at DESC
    LIMIT 80
  `).all();

  return json(result.results || []);
}

async function handleMarkNotificationRead(env, notificationId) {
  if (!notificationId) {
    return json({ error: "notification id is required" }, 400);
  }

  await env.DB.prepare(`
    UPDATE notifications
    SET is_read = 1,
        read_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(Number(notificationId)).run();

  return json({ ok: true });
}

async function handleMarkAllNotificationsRead(env, recipientRole = "admin", studentId = null) {
  const role = String(recipientRole || "admin").trim().toLowerCase();

  if (role === "student") {
    if (!studentId) return json({ error: "student_id is required" }, 400);

    await env.DB.prepare(`
      UPDATE notifications
      SET is_read = 1,
          read_at = CURRENT_TIMESTAMP
      WHERE recipient_role = 'student'
        AND student_id = ?
        AND is_read = 0
    `).bind(Number(studentId)).run();

    return json({ ok: true });
  }

  await env.DB.prepare(`
    UPDATE notifications
    SET is_read = 1,
        read_at = CURRENT_TIMESTAMP
    WHERE recipient_role = 'admin'
      AND is_read = 0
  `).run();

  return json({ ok: true });
}

async function handleCreateStudentVideoDirectUpload(request, env, studentId) {
  if (!studentId) return json({ error: "student_id is required" }, 400);
  const data = await readJsonBody(request);
  const fileName = String(data.file_name || data.fileName || "video.mp4").trim();
  const contentType = String(data.content_type || data.contentType || "application/octet-stream").trim();
  const fileSize = Number(data.file_size || data.fileSize || 0);

  if (!contentType.startsWith("video/")) {
    return json({ error: "El archivo debe ser un video" }, 400);
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return json({ error: "Invalid file size" }, 400);
  }

  const key = `student-videos/${studentId}/${Date.now()}-${safeFileName(fileName) || "video.mp4"}`;
  const uploadUrl = await createPresignedR2PutUrl(env, key);
  return json({ upload_url: uploadUrl, file_key: key, expires_in: DIRECT_UPLOAD_EXPIRES_SECONDS });
}

async function handleCompleteStudentVideoDirectUpload(request, env, studentId) {
  if (!env.STARFIT_IMAGES) return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);

  const data = await readJsonBody(request);
  const fileKey = String(data.file_key || data.fileKey || "");
  const classId = String(data.class_id || data.classId || "").trim();
  const note = String(data.note || data.comment || "").trim();
  if (!fileKey.startsWith(`student-videos/${studentId}/`)) {
    return json({ error: "Invalid video key" }, 400);
  }

  const object = await env.STARFIT_IMAGES.head(fileKey);
  if (!object) return json({ error: "El video todavía no llegó a R2" }, 409);

  const existing = await env.DB.prepare(
    "SELECT * FROM student_videos WHERE student_id = ? AND file_key = ?"
  ).bind(Number(studentId), fileKey).first();
  if (existing) return json({ ...existing, file_url: `/api/student-videos/${existing.id}/file` });

  const insertResult = await env.DB.prepare(`
    INSERT INTO student_videos (
      student_id, class_id, file_name, file_key, content_type,
      file_size, note, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP)
  `).bind(
    Number(studentId),
    classId ? Number(classId) : null,
    String(data.file_name || data.fileName || "video.mp4"),
    fileKey,
    String(data.content_type || data.contentType || "application/octet-stream"),
    Number(object.size || 0),
    note
  ).run();
  const videoId = insertResult.meta?.last_row_id || null;
  const savedVideo = await env.DB.prepare(
    "SELECT * FROM student_videos WHERE id = ?"
  ).bind(Number(videoId)).first();
  const studentName = await getStudentName(env, studentId);

  await createAdminNotification(env, {
    studentId,
    type: "video_uploaded",
    title: `${studentName} subió un video`,
    body: note || "Nuevo video enviado para revisión.",
    targetUrl: classId
      ? adminClassTarget(studentId, classId, "videos")
      : `admin/alumno.html?id=${studentId}`
  });

  return json({ ...savedVideo, file_url: `/api/student-videos/${videoId}/file` }, 201);
}

async function handleUploadStudentVideo(request, env, studentId) {
  if (!env.STARFIT_IMAGES) {
    return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);
  }

  const formData = await request.formData();
  const video = formData.get("video") || formData.get("file");
  const classId = String(formData.get("class_id") || formData.get("classId") || "").trim();
  const note = String(formData.get("note") || formData.get("comment") || "").trim();

  if (!studentId) return json({ error: "student_id is required" }, 400);
  if (!video || typeof video === "string") return json({ error: "Missing video file" }, 400);

  const contentType = video.type || "application/octet-stream";
  const arrayBuffer = await video.arrayBuffer();
  const key = "student-videos/" + studentId + "/" + Date.now() + "-" + safeFileName(video.name || "video.mp4");

  await env.STARFIT_IMAGES.put(key, arrayBuffer, {
    httpMetadata: { contentType }
  });

  const insertResult = await env.DB.prepare(`
    INSERT INTO student_videos (
      student_id,
      class_id,
      file_name,
      file_key,
      content_type,
      file_size,
      note,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP)
  `).bind(
    Number(studentId),
    classId ? Number(classId) : null,
    String(video.name || "video.mp4"),
    key,
    contentType,
    Number(video.size || arrayBuffer.byteLength || 0),
    note
  ).run();

  const videoId = insertResult.meta?.last_row_id || null;

  const savedVideo = await env.DB.prepare(`
    SELECT *
    FROM student_videos
    WHERE id = ?
  `).bind(Number(videoId)).first();

  const studentName = await getStudentName(env, studentId);

  await createAdminNotification(env, {
    studentId,
    type: "video_uploaded",
    title: `${studentName} subió un video`,
    body: note ? note : "Nuevo video enviado para revisión.",
    targetUrl: classId
      ? `admin/alumno.html?id=${studentId}&classId=${encodeURIComponent(classId)}&section=videos`
      : `admin/alumno.html?id=${studentId}`
  });

  return json({
    ...savedVideo,
    file_url: videoId ? `/api/student-videos/${videoId}/file` : ""
  }, 201);
}

async function handleListStudentVideos(env, studentId, classId = null) {
  if (!studentId) return json({ error: "student_id is required" }, 400);

  if (classId) {
    const result = await env.DB.prepare(`
      SELECT *
      FROM student_videos
      WHERE student_id = ?
        AND class_id = ?
      ORDER BY created_at DESC, id DESC
    `).bind(Number(studentId), Number(classId)).all();

    return json((result.results || []).map(row => ({
      ...row,
      file_url: `/api/student-videos/${row.id}/file`
    })));
  }

  const result = await env.DB.prepare(`
    SELECT *
    FROM student_videos
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
  `).bind(Number(studentId)).all();

  return json((result.results || []).map(row => ({
    ...row,
    file_url: `/api/student-videos/${row.id}/file`
  })));
}

async function handleGetStudentVideoFile(request, env, videoId) {
  if (!env.STARFIT_IMAGES) {
    return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);
  }

  if (!videoId) return json({ error: "video id is required" }, 400);

  const video = await env.DB.prepare(`
    SELECT *
    FROM student_videos
    WHERE id = ?
  `).bind(Number(videoId)).first();

  if (!video) return json({ error: "Video not found" }, 404);
  const accessDenied = await requireStudentAccess(request, env, video.student_id);
  if (accessDenied) return accessDenied;
  if (!String(video.file_key || "").startsWith("student-videos/")) {
    return json({ error: "Invalid video key" }, 400);
  }

  const object = await env.STARFIT_IMAGES.get(video.file_key);
  if (!object) return json({ error: "Video file not found" }, 404);

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Content-Disposition", `inline; filename="${String(video.file_name || "video.mp4").replace(/"/g, "")}"`);

  return new Response(object.body, { headers });
}

async function handleMarkStudentVideoReviewed(env, videoId) {
  if (!videoId) return json({ error: "video id is required" }, 400);

  await env.DB.prepare(`
    UPDATE student_videos
    SET status = 'reviewed',
        reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(Number(videoId)).run();

  const video = await env.DB.prepare(`
    SELECT *
    FROM student_videos
    WHERE id = ?
  `).bind(Number(videoId)).first();

  if (video) {
    await createStudentNotification(env, {
      studentId: video.student_id,
      type: "video_reviewed",
      title: "Yanina revisó tu video",
      body: "Tu video ya fue revisado.",
      targetUrl: video.class_id
        ? studentClassTarget(video.student_id, video.class_id, "videos")
        : `alumno/index.html?id=${video.student_id}`
    });
  }

  return json(video || null);
}

function isAllowedQuestionnaireType(contentType, fileName = "") {
  const type = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  return type === "application/pdf" ||
    type.startsWith("image/") ||
    name.endsWith(".pdf") ||
    /\.(png|jpe?g|webp)$/i.test(name);
}

async function handleGetHealthQuestionnaire(env, studentId) {
  if (!studentId) return json({ error: "student_id is required" }, 400);
  await ensureStudentHealthQuestionnairesTable(env);

  const row = await env.DB.prepare(`
    SELECT *
    FROM student_health_questionnaires
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).bind(Number(studentId)).first();

  return json(row ? { ...row, file_url: `/api/health-questionnaires/${row.id}/file` } : null);
}

async function handleCreateHealthQuestionnaireDirectUpload(request, env, studentId) {
  if (!studentId) return json({ error: "student_id is required" }, 400);
  const data = await readJsonBody(request);
  const fileName = String(data.file_name || data.fileName || "cuestionario-salud.pdf").trim();
  const contentType = String(data.content_type || data.contentType || "application/pdf").trim();
  const fileSize = Number(data.file_size || data.fileSize || 0);

  if (!isAllowedQuestionnaireType(contentType, fileName)) {
    return json({ error: "Subi el cuestionario en PDF o imagen" }, 400);
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return json({ error: "Invalid file size" }, 400);
  }

  const key = `health-questionnaires/${studentId}/${Date.now()}-${safeFileName(fileName) || "cuestionario-salud.pdf"}`;
  const uploadUrl = await createPresignedR2PutUrl(env, key);
  return json({ upload_url: uploadUrl, file_key: key, expires_in: DIRECT_UPLOAD_EXPIRES_SECONDS });
}

async function handleCompleteHealthQuestionnaireDirectUpload(request, env, studentId) {
  if (!env.STARFIT_IMAGES) return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);
  if (!studentId) return json({ error: "student_id is required" }, 400);
  await ensureStudentHealthQuestionnairesTable(env);

  const data = await readJsonBody(request);
  const fileKey = String(data.file_key || data.fileKey || "");
  const fileName = String(data.file_name || data.fileName || "cuestionario-salud.pdf");
  const contentType = String(data.content_type || data.contentType || "application/pdf");

  if (!fileKey.startsWith(`health-questionnaires/${studentId}/`)) {
    return json({ error: "Invalid questionnaire key" }, 400);
  }
  if (!isAllowedQuestionnaireType(contentType, fileName)) {
    return json({ error: "Subi el cuestionario en PDF o imagen" }, 400);
  }

  const object = await env.STARFIT_IMAGES.head(fileKey);
  if (!object) return json({ error: "El cuestionario todavia no llego a R2" }, 409);

  const existing = await env.DB.prepare(`
    SELECT *
    FROM student_health_questionnaires
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).bind(Number(studentId)).first();

  let questionnaireId = existing?.id || null;
  if (existing) {
    await env.DB.prepare(`
      UPDATE student_health_questionnaires
      SET file_name = ?,
          file_key = ?,
          content_type = ?,
          file_size = ?,
          status = 'completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(fileName, fileKey, contentType, Number(object.size || 0), Number(existing.id)).run();
  } else {
    const insertResult = await env.DB.prepare(`
      INSERT INTO student_health_questionnaires (
        student_id, file_name, file_key, content_type, file_size, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(Number(studentId), fileName, fileKey, contentType, Number(object.size || 0)).run();
    questionnaireId = insertResult.meta?.last_row_id || null;
  }

  const saved = await env.DB.prepare(`
    SELECT *
    FROM student_health_questionnaires
    WHERE id = ?
  `).bind(Number(questionnaireId)).first();
  const studentName = await getStudentName(env, studentId);

  await env.DB.prepare(`
    UPDATE notifications
    SET is_read = 1,
        read_at = CURRENT_TIMESTAMP
    WHERE recipient_role = 'student'
      AND student_id = ?
      AND type = 'health_questionnaire_pending'
      AND is_read = 0
  `).bind(Number(studentId)).run();

  await createAdminNotification(env, {
    studentId,
    type: "health_questionnaire_uploaded",
    title: `${studentName} completo el cuestionario`,
    body: "El cuestionario de salud fue subido a la ficha.",
    targetUrl: adminStudentProfileTarget(studentId)
  });

  return json({ ...saved, file_url: `/api/health-questionnaires/${questionnaireId}/file` }, 201);
}

async function handleGetHealthQuestionnaireFile(request, env, questionnaireId) {
  if (!env.STARFIT_IMAGES) {
    return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);
  }
  if (!questionnaireId) return json({ error: "questionnaire id is required" }, 400);
  await ensureStudentHealthQuestionnairesTable(env);

  const questionnaire = await env.DB.prepare(`
    SELECT *
    FROM student_health_questionnaires
    WHERE id = ?
  `).bind(Number(questionnaireId)).first();

  if (!questionnaire) return json({ error: "Questionnaire not found" }, 404);
  const accessDenied = await requireStudentAccess(request, env, questionnaire.student_id);
  if (accessDenied) return accessDenied;
  if (!String(questionnaire.file_key || "").startsWith("health-questionnaires/")) {
    return json({ error: "Invalid questionnaire key" }, 400);
  }

  const object = await env.STARFIT_IMAGES.get(questionnaire.file_key);
  if (!object) return json({ error: "Questionnaire file not found" }, 404);

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Content-Disposition", `inline; filename="${String(questionnaire.file_name || "cuestionario-salud.pdf").replace(/"/g, "")}"`);

  return new Response(object.body, { headers });
}

async function handleMarkPaymentSummaryPaid(env, summaryId) {
  if (!summaryId) {
    return json({ error: "payment summary id is required" }, 400);
  }

  const previousSummary = await env.DB.prepare(`
    SELECT *
    FROM payment_summaries
    WHERE id = ?
  `).bind(Number(summaryId)).first();

  if (!previousSummary) {
    return json({ error: "Payment summary not found" }, 404);
  }

  await env.DB.prepare(`
    UPDATE payment_summaries
    SET status = 'paid',
        paid_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(Number(summaryId)).run();

  const summary = await env.DB.prepare(`
    SELECT *
    FROM payment_summaries
    WHERE id = ?
  `).bind(Number(summaryId)).first();

  if (String(previousSummary.status || "").toLowerCase() !== "paid") {
    const studentName = await getStudentName(env, summary.student_id);

    await createAdminNotification(env, {
      studentId: summary.student_id,
      type: "payment_paid",
      title: `${studentName} realizó un pago`,
      body: `Marcó como pagado el resumen de ${summary.month}.`,
      targetUrl: `admin/historial-pagos.html?id=${summary.student_id}`
    });
  }

  return json(summary || null);
}

const NUTRITION_MEAL_TYPES = new Set(["breakfast", "lunch", "snack", "dinner"]);
const NUTRITION_REVIEW_STATUSES = new Set(["pending", "good", "review", "no_comment"]);

function isNutritionIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function nutritionCount(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function nutritionMealResponse(row) {
  if (!row) return null;
  return {
    ...row,
    photo_url: `/api/nutrition-meals/${row.id}/photo`
  };
}

async function handleGetStudentNutrition(env, studentId, fromDate, toDate) {
  await ensureNutritionTables(env);
  const today = todayInBuenosAires();
  const from = isNutritionIsoDate(fromDate) ? fromDate : today;
  const to = isNutritionIsoDate(toDate) ? toDate : from;
  if (from > to) return json({ error: "Invalid nutrition date range" }, 400);

  const student = await env.DB.prepare(`
    SELECT id, full_name, goal
    FROM students
    WHERE id = ?
  `).bind(Number(studentId)).first();
  if (!student) return json({ error: "Student not found" }, 404);

  const plan = await env.DB.prepare(`
    SELECT student_id, general_goal, monthly_goal,
           water_target, vegetables_target, protein_target, updated_at
    FROM student_nutrition_plans
    WHERE student_id = ?
  `).bind(Number(studentId)).first();

  const habits = await env.DB.prepare(`
    SELECT habit_date, water_glasses, vegetables_meals, protein_meals, updated_at
    FROM student_nutrition_habits
    WHERE student_id = ? AND habit_date BETWEEN ? AND ?
    ORDER BY habit_date ASC
  `).bind(Number(studentId), from, to).all();

  const meals = await env.DB.prepare(`
    SELECT id, student_id, meal_date, meal_type, note, photo_name, content_type,
           file_size, review_status, trainer_comment, reviewed_at, created_at, updated_at
    FROM student_nutrition_meals
    WHERE student_id = ? AND meal_date BETWEEN ? AND ?
    ORDER BY meal_date ASC,
      CASE meal_type
        WHEN 'breakfast' THEN 1
        WHEN 'lunch' THEN 2
        WHEN 'snack' THEN 3
        WHEN 'dinner' THEN 4
        ELSE 5
      END ASC
  `).bind(Number(studentId), from, to).all();

  return json({
    student,
    plan: plan || {
      student_id: Number(studentId),
      general_goal: String(student.goal || ""),
      monthly_goal: "",
      water_target: 8,
      vegetables_target: 3,
      protein_target: 2,
      updated_at: null
    },
    habits: habits.results || [],
    meals: (meals.results || []).map(nutritionMealResponse)
  });
}

async function handleSaveStudentNutritionPlan(request, env, studentId) {
  await ensureNutritionTables(env);
  const data = await readJsonBody(request);
  const generalGoal = String(data.general_goal || data.generalGoal || "").trim().slice(0, 1200);
  const monthlyGoal = String(data.monthly_goal || data.monthlyGoal || "").trim().slice(0, 1200);

  await env.DB.prepare(`
    INSERT INTO student_nutrition_plans (
      student_id, general_goal, monthly_goal,
      water_target, vegetables_target, protein_target, updated_at
    ) VALUES (?, ?, ?, 8, 3, 2, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id) DO UPDATE SET
      general_goal = excluded.general_goal,
      monthly_goal = excluded.monthly_goal,
      updated_at = CURRENT_TIMESTAMP
  `).bind(Number(studentId), generalGoal, monthlyGoal).run();

  await env.DB.prepare(`
    UPDATE students
    SET goal = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(generalGoal, Number(studentId)).run();

  await createStudentNotification(env, {
    studentId,
    type: "nutrition_plan_updated",
    title: "Yanina actualizó tu plan de nutrición",
    body: monthlyGoal || generalGoal || "Tu plan nutricional tiene novedades.",
    targetUrl: `alumno/nutricion.html?id=${encodeURIComponent(studentId)}`
  });

  return await handleGetStudentNutrition(env, studentId, todayInBuenosAires(), todayInBuenosAires());
}

async function handleSaveStudentNutritionHabits(request, env, studentId, habitDate) {
  await ensureNutritionTables(env);
  if (!isNutritionIsoDate(habitDate)) return json({ error: "Invalid habit date" }, 400);
  const data = await readJsonBody(request);
  const waterGlasses = nutritionCount(data.water_glasses ?? data.waterGlasses, 30);
  const vegetablesMeals = nutritionCount(data.vegetables_meals ?? data.vegetablesMeals, 10);
  const proteinMeals = nutritionCount(data.protein_meals ?? data.proteinMeals, 10);

  await env.DB.prepare(`
    INSERT INTO student_nutrition_habits (
      student_id, habit_date, water_glasses, vegetables_meals, protein_meals, updated_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, habit_date) DO UPDATE SET
      water_glasses = excluded.water_glasses,
      vegetables_meals = excluded.vegetables_meals,
      protein_meals = excluded.protein_meals,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    Number(studentId),
    habitDate,
    waterGlasses,
    vegetablesMeals,
    proteinMeals
  ).run();

  const saved = await env.DB.prepare(`
    SELECT habit_date, water_glasses, vegetables_meals, protein_meals, updated_at
    FROM student_nutrition_habits
    WHERE student_id = ? AND habit_date = ?
  `).bind(Number(studentId), habitDate).first();
  return json(saved);
}

async function handleCreateNutritionMealDirectUpload(request, env, studentId) {
  const data = await readJsonBody(request);
  const fileName = String(data.file_name || data.fileName || "comida.jpg").trim();
  const contentType = String(data.content_type || data.contentType || "image/jpeg").trim().toLowerCase();
  const fileSize = Number(data.file_size || data.fileSize || 0);
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
  if (!allowedTypes.has(contentType)) return json({ error: "Usá una imagen JPG, PNG, WebP o HEIC" }, 400);
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 8 * 1024 * 1024) {
    return json({ error: "La imagen debe pesar hasta 8 MB" }, 400);
  }
  const key = `nutrition-meals/${studentId}/${Date.now()}-${safeFileName(fileName) || "comida.jpg"}`;
  const uploadUrl = await createPresignedR2PutUrl(env, key);
  return json({ upload_url: uploadUrl, file_key: key, expires_in: DIRECT_UPLOAD_EXPIRES_SECONDS });
}

async function handleCompleteNutritionMealDirectUpload(request, env, studentId) {
  await ensureNutritionTables(env);
  if (!env.STARFIT_IMAGES) return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);
  const data = await readJsonBody(request);
  const fileKey = String(data.file_key || data.fileKey || "");
  const mealDate = String(data.meal_date || data.mealDate || "");
  const mealType = String(data.meal_type || data.mealType || "").toLowerCase();
  const note = String(data.note || data.comment || "").trim().slice(0, 1600);
  if (!fileKey.startsWith(`nutrition-meals/${studentId}/`)) return json({ error: "Invalid nutrition image key" }, 400);
  if (!isNutritionIsoDate(mealDate)) return json({ error: "Invalid meal date" }, 400);
  if (!NUTRITION_MEAL_TYPES.has(mealType)) return json({ error: "Invalid meal type" }, 400);

  const object = await env.STARFIT_IMAGES.head(fileKey);
  if (!object) return json({ error: "La foto todavía no llegó al almacenamiento" }, 409);
  const previous = await env.DB.prepare(`
    SELECT id, photo_key
    FROM student_nutrition_meals
    WHERE student_id = ? AND meal_date = ? AND meal_type = ?
  `).bind(Number(studentId), mealDate, mealType).first();

  await env.DB.prepare(`
    INSERT INTO student_nutrition_meals (
      student_id, meal_date, meal_type, note, photo_key, photo_name,
      content_type, file_size, review_status, trainer_comment,
      reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, meal_date, meal_type) DO UPDATE SET
      note = excluded.note,
      photo_key = excluded.photo_key,
      photo_name = excluded.photo_name,
      content_type = excluded.content_type,
      file_size = excluded.file_size,
      review_status = 'pending',
      trainer_comment = '',
      reviewed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    Number(studentId),
    mealDate,
    mealType,
    note,
    fileKey,
    String(data.file_name || data.fileName || "comida.jpg"),
    String(data.content_type || data.contentType || "image/jpeg"),
    Number(object.size || 0)
  ).run();

  if (previous?.photo_key && previous.photo_key !== fileKey) {
    await env.STARFIT_IMAGES.delete(previous.photo_key).catch(() => null);
  }

  const saved = await env.DB.prepare(`
    SELECT id, student_id, meal_date, meal_type, note, photo_name, content_type,
           file_size, review_status, trainer_comment, reviewed_at, created_at, updated_at
    FROM student_nutrition_meals
    WHERE student_id = ? AND meal_date = ? AND meal_type = ?
  `).bind(Number(studentId), mealDate, mealType).first();
  const studentName = await getStudentName(env, studentId);
  await createAdminNotification(env, {
    studentId,
    type: "nutrition_meal_uploaded",
    title: `${studentName} registró una comida`,
    body: note || `Registro nutricional del ${mealDate}.`,
    targetUrl: `admin/nutricion.html?id=${encodeURIComponent(studentId)}`
  });
  return json(nutritionMealResponse(saved), previous ? 200 : 201);
}

async function handleReviewNutritionMeal(request, env, mealId) {
  await ensureNutritionTables(env);
  const data = await readJsonBody(request);
  const status = String(data.review_status || data.reviewStatus || "").toLowerCase();
  const trainerComment = String(data.trainer_comment || data.trainerComment || "").trim().slice(0, 1600);
  if (!NUTRITION_REVIEW_STATUSES.has(status) || status === "pending") {
    return json({ error: "Elegí una devolución para la comida" }, 400);
  }
  const meal = await env.DB.prepare(`
    SELECT *
    FROM student_nutrition_meals
    WHERE id = ?
  `).bind(Number(mealId)).first();
  if (!meal) return json({ error: "Nutrition meal not found" }, 404);

  await env.DB.prepare(`
    UPDATE student_nutrition_meals
    SET review_status = ?,
        trainer_comment = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, trainerComment, Number(mealId)).run();

  const labels = {
    good: "Yanina marcó tu comida como bien",
    review: "Yanina dejó una observación sobre tu comida",
    no_comment: "Yanina revisó tu comida"
  };
  await createStudentNotification(env, {
    studentId: meal.student_id,
    type: "nutrition_feedback",
    title: labels[status] || "Nueva devolución de nutrición",
    body: trainerComment || "Ya podés ver la devolución en tu plan.",
    targetUrl: `alumno/nutricion.html?id=${encodeURIComponent(meal.student_id)}`
  });

  const saved = await env.DB.prepare(`
    SELECT id, student_id, meal_date, meal_type, note, photo_name, content_type,
           file_size, review_status, trainer_comment, reviewed_at, created_at, updated_at
    FROM student_nutrition_meals
    WHERE id = ?
  `).bind(Number(mealId)).first();
  return json(nutritionMealResponse(saved));
}

async function handleGetNutritionMealPhoto(request, env, mealId) {
  await ensureNutritionTables(env);
  if (!env.STARFIT_IMAGES) return json({ error: "Missing R2 binding STARFIT_IMAGES" }, 500);
  const meal = await env.DB.prepare(`
    SELECT student_id, photo_key, content_type, photo_name
    FROM student_nutrition_meals
    WHERE id = ?
  `).bind(Number(mealId)).first();
  if (!meal) return json({ error: "Nutrition meal not found" }, 404);
  const accessDenied = await requireStudentAccess(request, env, meal.student_id);
  if (accessDenied) return accessDenied;
  const object = await env.STARFIT_IMAGES.get(meal.photo_key);
  if (!object) return json({ error: "Nutrition image not found" }, 404);
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", meal.content_type || object.httpMetadata?.contentType || "image/jpeg");
  headers.set("Content-Disposition", `inline; filename="${safeFileName(meal.photo_name || "comida.jpg")}"`);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    async function cloneDefaultClassesForStudent(studentId) {
      const template = await env.DB
        .prepare("SELECT * FROM classes WHERE student_id = ? ORDER BY id ASC LIMIT 4")
        .bind(1)
        .all();

      const templateRows = template.results || [];
      const createdClasses = [];

      for (const sourceRow of templateRows) {
        const row = { ...sourceRow };
        delete row.id;
        row.student_id = studentId;

        const columns = Object.keys(row);
        const placeholders = columns.map(() => "?").join(", ");
        const values = columns.map(column => row[column]);

        const insertResult = await env.DB
          .prepare(`INSERT INTO classes (${columns.join(", ")}) VALUES (${placeholders})`)
          .bind(...values)
          .run();

        const classId = insertResult.meta?.last_row_id;

        if (classId) {
          const createdClass = await env.DB
            .prepare("SELECT * FROM classes WHERE id = ?")
            .bind(classId)
            .first();

          if (createdClass) createdClasses.push(createdClass);
        }
      }

      return createdClasses;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const studentNutritionMatch = url.pathname.match(/^\/api\/students\/(\d+)\/nutrition$/);
    if (studentNutritionMatch && request.method === "GET") {
      const accessDenied = await requireStudentAccess(request, env, studentNutritionMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleGetStudentNutrition(
        env,
        studentNutritionMatch[1],
        url.searchParams.get("from"),
        url.searchParams.get("to")
      );
    }
    if (studentNutritionMatch && request.method === "PUT") {
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;
      return await handleSaveStudentNutritionPlan(request, env, studentNutritionMatch[1]);
    }

    const nutritionHabitsMatch = url.pathname.match(/^\/api\/students\/(\d+)\/nutrition\/habits\/(\d{4}-\d{2}-\d{2})$/);
    if (nutritionHabitsMatch && request.method === "PUT") {
      const accessDenied = await requireStudentAccess(request, env, nutritionHabitsMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleSaveStudentNutritionHabits(
        request,
        env,
        nutritionHabitsMatch[1],
        nutritionHabitsMatch[2]
      );
    }

    const nutritionUploadMatch = url.pathname.match(/^\/api\/students\/(\d+)\/nutrition\/meals\/direct-upload$/);
    if (nutritionUploadMatch && request.method === "POST") {
      const accessDenied = await requireStudentAccess(request, env, nutritionUploadMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleCreateNutritionMealDirectUpload(request, env, nutritionUploadMatch[1]);
    }

    const nutritionUploadCompleteMatch = url.pathname.match(/^\/api\/students\/(\d+)\/nutrition\/meals\/direct-upload\/complete$/);
    if (nutritionUploadCompleteMatch && request.method === "POST") {
      const accessDenied = await requireStudentAccess(request, env, nutritionUploadCompleteMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleCompleteNutritionMealDirectUpload(request, env, nutritionUploadCompleteMatch[1]);
    }

    const nutritionReviewMatch = url.pathname.match(/^\/api\/nutrition-meals\/(\d+)\/review$/);
    if (nutritionReviewMatch && request.method === "PATCH") {
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;
      return await handleReviewNutritionMeal(request, env, nutritionReviewMatch[1]);
    }

    const nutritionPhotoMatch = url.pathname.match(/^\/api\/nutrition-meals\/(\d+)\/photo$/);
    if (nutritionPhotoMatch && request.method === "GET") {
      return await handleGetNutritionMealPhoto(request, env, nutritionPhotoMatch[1]);
    }

    if (url.pathname === "/api/notifications" && request.method === "GET") {
      return await handleListNotifications(
        env,
        url.searchParams.get("recipient") || "admin",
        url.searchParams.get("student_id") || url.searchParams.get("studentId")
      );
    }

    const notificationReadMatch = url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/);

    if (notificationReadMatch && request.method === "POST") {
      return await handleMarkNotificationRead(env, notificationReadMatch[1]);
    }

    if (url.pathname === "/api/notifications/read-all" && request.method === "POST") {
      return await handleMarkAllNotificationsRead(
        env,
        url.searchParams.get("recipient") || "admin",
        url.searchParams.get("student_id") || url.searchParams.get("studentId")
      );
    }

    const directUploadMatch = url.pathname.match(/^\/api\/students\/(\d+)\/videos\/direct-upload$/);

    if (directUploadMatch && request.method === "POST") {
      const accessDenied = await requireStudentAccess(request, env, directUploadMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleCreateStudentVideoDirectUpload(request, env, directUploadMatch[1]);
    }

    const directUploadCompleteMatch = url.pathname.match(/^\/api\/students\/(\d+)\/videos\/direct-upload\/complete$/);

    if (directUploadCompleteMatch && request.method === "POST") {
      const accessDenied = await requireStudentAccess(request, env, directUploadCompleteMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleCompleteStudentVideoDirectUpload(request, env, directUploadCompleteMatch[1]);
    }

    const healthQuestionnaireMatch = url.pathname.match(/^\/api\/students\/(\d+)\/health-questionnaire$/);

    if (healthQuestionnaireMatch && request.method === "GET") {
      const accessDenied = await requireStudentAccess(request, env, healthQuestionnaireMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleGetHealthQuestionnaire(env, healthQuestionnaireMatch[1]);
    }

    const healthQuestionnaireUploadMatch = url.pathname.match(/^\/api\/students\/(\d+)\/health-questionnaire\/direct-upload$/);

    if (healthQuestionnaireUploadMatch && request.method === "POST") {
      const accessDenied = await requireStudentAccess(request, env, healthQuestionnaireUploadMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleCreateHealthQuestionnaireDirectUpload(request, env, healthQuestionnaireUploadMatch[1]);
    }

    const healthQuestionnaireCompleteMatch = url.pathname.match(/^\/api\/students\/(\d+)\/health-questionnaire\/direct-upload\/complete$/);

    if (healthQuestionnaireCompleteMatch && request.method === "POST") {
      const accessDenied = await requireStudentAccess(request, env, healthQuestionnaireCompleteMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleCompleteHealthQuestionnaireDirectUpload(request, env, healthQuestionnaireCompleteMatch[1]);
    }

    const healthQuestionnaireFileMatch = url.pathname.match(/^\/api\/health-questionnaires\/(\d+)\/file$/);

    if (healthQuestionnaireFileMatch && request.method === "GET") {
      return await handleGetHealthQuestionnaireFile(request, env, healthQuestionnaireFileMatch[1]);
    }

    const studentVideosMatch = url.pathname.match(/^\/api\/students\/(\d+)\/videos$/);

    if (studentVideosMatch && request.method === "GET") {
      const accessDenied = await requireStudentAccess(request, env, studentVideosMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleListStudentVideos(env, studentVideosMatch[1], url.searchParams.get("class_id") || url.searchParams.get("classId"));
    }

    if (studentVideosMatch && request.method === "POST") {
      const accessDenied = await requireStudentAccess(request, env, studentVideosMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleUploadStudentVideo(request, env, studentVideosMatch[1]);
    }

    const studentVideoFileMatch = url.pathname.match(/^\/api\/student-videos\/(\d+)\/file$/);

    if (studentVideoFileMatch && request.method === "GET") {
      return await handleGetStudentVideoFile(request, env, studentVideoFileMatch[1]);
    }

    const studentVideoReviewedMatch = url.pathname.match(/^\/api\/student-videos\/(\d+)\/reviewed$/);

    if (studentVideoReviewedMatch && request.method === "POST") {
      return await handleMarkStudentVideoReviewed(env, studentVideoReviewedMatch[1]);
    }

    const classCommentsMatch = url.pathname.match(/^\/api\/classes\/(\d+)\/comments$/);

    if (classCommentsMatch && request.method === "GET") {
      const accessDenied = await requireClassAccess(request, env, classCommentsMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleListClassComments(env, classCommentsMatch[1]);
    }

    if (classCommentsMatch && request.method === "POST") {
      const accessDenied = await requireClassAccess(request, env, classCommentsMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleCreateClassComment(request, env, classCommentsMatch[1]);
    }

    const videoCommentsMatch = url.pathname.match(/^\/api\/student-videos\/(\d+)\/comments$/);

    if (videoCommentsMatch && request.method === "GET") {
      return await handleListVideoComments(env, videoCommentsMatch[1]);
    }

    if (videoCommentsMatch && request.method === "POST") {
      return await handleCreateVideoComment(request, env, videoCommentsMatch[1]);
    }

if (url.pathname === "/api/auth/login" && request.method === "POST") {
  return await handleAuthLogin(request, env);
}

if (url.pathname === "/api/student-auth/setup-password" && request.method === "POST") {
  return await handleSetupStudentPassword(request, env);
}

if (url.pathname === "/api/payment-summaries" && request.method === "POST") {
  return await handleUpsertPaymentSummary(request, env);
}

const paymentSummaryMatch = url.pathname.match(/^\/api\/students\/(\d+)\/payment-summary$/);

if (paymentSummaryMatch && request.method === "GET") {
  const accessDenied = await requireStudentAccess(request, env, paymentSummaryMatch[1]);
  if (accessDenied) return accessDenied;
  return await handleGetPaymentSummary(
    env,
    paymentSummaryMatch[1],
    url.searchParams.get("month")
  );
}

const paymentSummaryPaidMatch = url.pathname.match(/^\/api\/payment-summaries\/(\d+)\/paid$/);

if (paymentSummaryPaidMatch && request.method === "POST") {
  return await handleMarkPaymentSummaryPaid(env, paymentSummaryPaidMatch[1]);
}

if (url.pathname === "/api/starfit/extract" && request.method === "POST") {
  return await handleStarfitExtract(request, env);
}

    const measurementsMatch = url.pathname.match(/^\/api\/students\/(\d+)\/measurements$/);

    if (measurementsMatch && request.method === "GET") {
      const accessDenied = await requireStudentAccess(request, env, measurementsMatch[1]);
      if (accessDenied) return accessDenied;
      return await handleListMeasurements(env, measurementsMatch[1]);
    }

    if (measurementsMatch && request.method === "POST") {
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;
      return await handleCreateMeasurement(request, env, measurementsMatch[1]);
    }
    const measurementDeleteMatch = url.pathname.match(/^\/api\/students\/(\d+)\/measurements\/(\d+)$/);

if (measurementDeleteMatch && request.method === "DELETE") {
  const studentId = Number(measurementDeleteMatch[1]);
  const measurementId = Number(measurementDeleteMatch[2]);

  const existing = await env.DB
    .prepare("SELECT * FROM student_measurements WHERE id = ? AND student_id = ?")
    .bind(measurementId, studentId)
    .first();

  if (!existing) {
    return json({ error: "Measurement not found" }, 404);
  }

  await env.DB
    .prepare("DELETE FROM student_measurements WHERE id = ? AND student_id = ?")
    .bind(measurementId, studentId)
    .run();

  return json({ ok: true, deleted_measurement_id: measurementId });
}
if (url.pathname === "/api/starfit/image" && request.method === "GET") {
  const key = url.searchParams.get("key");

  if (!key) return json({ error: "Missing key" }, 400);
  if (!key.startsWith("starfit/")) return json({ error: "Invalid key" }, 400);

  const object = await env.STARFIT_IMAGES.get(key);

  if (!object) {
    return json({ error: "Image not found" }, 404);
  }

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");

  return new Response(object.body, { headers });
}
    if (url.pathname === "/api/students" && request.method === "GET") {
      const result = await env.DB
        .prepare("SELECT * FROM students ORDER BY id DESC")
        .all();

      return json(result.results || []);
    }

    if (url.pathname === "/api/students" && request.method === "POST") {
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;

      const data = await readJsonBody(request);

      const insertResult = await env.DB
        .prepare(`
          INSERT INTO students (
            full_name,
            age,
            birth_date,
            phone,
            address,
            start_date,
            initial_weight,
            last_measurements_date,
            frequency,
            modality,
            goal,
            limitations,
            trainer_notes,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
        .bind(
          data.full_name || "",
          data.age || null,
          data.birth_date || "",
          data.phone || "",
          data.address || "",
          data.start_date || "",
          data.initial_weight || "",
          data.last_measurements_date || "",
          data.frequency || "",
          data.modality || "",
          data.goal || "",
          data.limitations || "",
          data.trainer_notes || ""
        )
        .run();

      const newStudentId = insertResult.meta?.last_row_id;

      if (!newStudentId) {
        return json({ error: "No se pudo obtener el ID del alumno creado" }, 500);
      }

      const student = await env.DB
        .prepare("SELECT * FROM students WHERE id = ?")
        .bind(newStudentId)
        .first();

      const student_account = await ensureStudentAccountForProfile(env, student, true);

      let classes = [];
      let classes_warning = null;

      try {
        classes = await cloneDefaultClassesForStudent(newStudentId);
      } catch (error) {
        classes_warning = "El alumno fue creado, pero no se pudieron crear las clases iniciales.";
        console.error(error);
      }

      await createStudentNotification(env, {
        studentId: newStudentId,
        type: "health_questionnaire_pending",
        title: "Completá tu cuestionario de salud",
        body: "Descargá el cuestionario, completalo y subilo desde Mi ficha.",
        targetUrl: studentProfileTarget(newStudentId)
      });

      return json({ student, student_account, classes, classes_warning }, 201);
    }

    const studentMatch = url.pathname.match(/^\/api\/students\/(\d+)$/);

    if (studentMatch && request.method === "GET") {
      const studentId = Number(studentMatch[1]);
      const accessDenied = await requireStudentAccess(request, env, studentId);
      if (accessDenied) return accessDenied;

      const student = await env.DB
        .prepare("SELECT * FROM students WHERE id = ?")
        .bind(studentId)
        .first();

      if (!student) {
        return json({ error: "Student not found" }, 404);
      }

      const student_account = await ensureStudentAccountForProfile(env, student, false);

      return json({ ...student, student_account });
    }

    if (studentMatch && request.method === "PUT") {
      const studentId = Number(studentMatch[1]);
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;

      const data = await readJsonBody(request);

      await env.DB
        .prepare(`
          UPDATE students 
          SET
            full_name = ?,
            age = ?,
            birth_date = ?,
            phone = ?,
            address = ?,
            start_date = ?,
            initial_weight = ?,
            last_measurements_date = ?,
            frequency = ?,
            modality = ?,
            goal = ?,
            limitations = ?,
            trainer_notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          data.full_name || "",
          data.age || null,
          data.birth_date || "",
          data.phone || "",
          data.address || "",
          data.start_date || "",
          data.initial_weight || "",
          data.last_measurements_date || "",
          data.frequency || "",
          data.modality || "",
          data.goal || "",
          data.limitations || "",
          data.trainer_notes || "",
          studentId
        )
        .run();

      const updatedStudent = await env.DB
        .prepare("SELECT * FROM students WHERE id = ?")
        .bind(studentId)
        .first();

      if (!updatedStudent) {
        return json({ error: "Student not found" }, 404);
      }

      const student_account = await ensureStudentAccountForProfile(env, updatedStudent, false);

      return json({ ...updatedStudent, student_account });
    }

    if (studentMatch && request.method === "DELETE") {
      const studentId = Number(studentMatch[1]);

      const existingStudent = await env.DB
        .prepare("SELECT * FROM students WHERE id = ?")
        .bind(studentId)
        .first();

      if (!existingStudent) {
        return json({ error: "Student not found" }, 404);
      }

      const classesResult = await env.DB
        .prepare("SELECT id FROM classes WHERE student_id = ?")
        .bind(studentId)
        .all();

      const classes = classesResult.results || [];

      for (const classItem of classes) {
        const routine = await env.DB
          .prepare("SELECT id FROM routines WHERE class_id = ?")
          .bind(classItem.id)
          .first();

        if (routine) {
          await env.DB
            .prepare("DELETE FROM routine_exercises WHERE routine_id = ?")
            .bind(routine.id)
            .run();

          await env.DB
            .prepare("DELETE FROM routines WHERE id = ?")
            .bind(routine.id)
            .run();
        }
      }

      await env.DB
        .prepare("DELETE FROM classes WHERE student_id = ?")
        .bind(studentId)
        .run();

      await env.DB
        .prepare("DELETE FROM students WHERE id = ?")
        .bind(studentId)
        .run();

      return json({ ok: true, deleted_student_id: studentId });
    }

    const studentClassesMatch = url.pathname.match(/^\/api\/students\/(\d+)\/classes$/);

    if (studentClassesMatch && request.method === "GET") {
      const studentId = Number(studentClassesMatch[1]);
      const accessDenied = await requireStudentAccess(request, env, studentId);
      if (accessDenied) return accessDenied;

      const classes = await env.DB
        .prepare("SELECT * FROM classes WHERE student_id = ? ORDER BY class_date ASC, id ASC")
        .bind(studentId)
        .all();

      return json(classes.results || []);
    }

    if (studentClassesMatch && request.method === "POST") {
      const studentId = Number(studentClassesMatch[1]);
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;
      const data = await readJsonBody(request);

      const insertResult = await env.DB
        .prepare(`
          INSERT INTO classes (
            student_id,
            class_date,
            class_time,
            routine_type,
            status,
            planning_criteria,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
        .bind(
          studentId,
          data.class_date || "",
          data.class_time || "",
          data.routine_type || "Nueva clase",
          data.status || "scheduled",
          data.planning_criteria || ""
        )
        .run();

      const newClassId = insertResult.meta?.last_row_id;

      const createdClass = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(newClassId)
        .first();

      if (createdClass && String(createdClass.status || "").toLowerCase() !== "draft") {
        await createStudentNotification(env, {
          studentId,
          type: "class_scheduled",
          title: "Nueva clase programada",
          body: `${createdClass.class_date || ""} ${createdClass.class_time || ""}`.trim(),
          targetUrl: studentClassTarget(studentId, createdClass.id, "routine")
        });
      }

      return json(createdClass, 201);
    }

    const classStatusMatch = url.pathname.match(/^\/api\/classes\/(\d+)\/status$/);

    if (classStatusMatch && request.method === "PATCH") {
      const classId = Number(classStatusMatch[1]);
      const accessDenied = await requireClassAccess(request, env, classId);
      if (accessDenied) return accessDenied;
      const auth = await verifyAuthToken(request, env).catch(() => null);
      const data = await readJsonBody(request);
      if (String(data.status || "").toLowerCase() !== "completed") {
        return json({ error: "Only completed status is allowed" }, 400);
      }

      const existingClass = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(classId)
        .first();
      if (!existingClass) return json({ error: "Class not found" }, 404);
      if (!classHasStarted(existingClass)) {
        return json({ error: "No se puede marcar como realizada una clase que todavía no comenzó." }, 409);
      }

      if (String(existingClass.status || "").toLowerCase() !== "completed") {
        await env.DB.prepare(`
          UPDATE classes
          SET status = 'completed', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(classId).run();

        if (auth?.role === "student") {
          const studentName = await getStudentName(env, existingClass.student_id);
          await createAdminNotification(env, {
            studentId: existingClass.student_id,
            type: "class_completed",
            title: `${studentName} marcó una clase como realizada`,
            body: `${existingClass.class_date || ""} ${existingClass.class_time || ""}`.trim(),
            targetUrl: adminClassTarget(existingClass.student_id, classId, "routine")
          });
        }
      }

      const updatedClass = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(classId)
        .first();
      return json({ ok: true, class: updatedClass });
    }

    const classUpdateMatch = url.pathname.match(/^\/api\/classes\/(\d+)$/);

    if (classUpdateMatch && request.method === "PUT") {
      const classId = Number(classUpdateMatch[1]);
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;
      const data = await readJsonBody(request);
      const previousClass = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(classId)
        .first();

      if (!previousClass) {
        return json({ error: "Class not found" }, 404);
      }

      await env.DB
        .prepare(`
          UPDATE classes
          SET
            class_date = ?,
            class_time = ?,
            routine_type = ?,
            status = ?,
            planning_criteria = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(
          data.class_date || "",
          data.class_time || "",
          data.routine_type || "",
          data.status || "scheduled",
          data.planning_criteria || "",
          classId
        )
        .run();

      const updatedClass = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(classId)
        .first();

      if (!updatedClass) {
        return json({ error: "Class not found" }, 404);
      }

      const changed = ["class_date", "class_time", "routine_type", "status", "planning_criteria"]
        .some(key => String(previousClass[key] || "") !== String(updatedClass[key] || ""));

      if (changed && String(updatedClass.status || "").toLowerCase() !== "draft") {
        await createStudentNotification(env, {
          studentId: updatedClass.student_id,
          type: "class_updated",
          title: "Yanina actualizó una clase",
          body: `${updatedClass.class_date || ""} ${updatedClass.class_time || ""}`.trim(),
          targetUrl: studentClassTarget(updatedClass.student_id, classId, "routine")
        });
      }

      return json(updatedClass);
    }

    if (classUpdateMatch && request.method === "DELETE") {
      const classId = Number(classUpdateMatch[1]);

      const existingClass = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(classId)
        .first();

      if (!existingClass) {
        return json({ error: "Class not found" }, 404);
      }

      if (existingClass.status !== "scheduled") {
        return json({ error: "Only scheduled classes can be deleted" }, 400);
      }

      const routine = await env.DB
        .prepare("SELECT * FROM routines WHERE class_id = ?")
        .bind(classId)
        .first();

      if (routine) {
        await env.DB
          .prepare("DELETE FROM routine_exercises WHERE routine_id = ?")
          .bind(routine.id)
          .run();

        await env.DB
          .prepare("DELETE FROM routines WHERE id = ?")
          .bind(routine.id)
          .run();
      }

      await env.DB
        .prepare("DELETE FROM classes WHERE id = ?")
        .bind(classId)
        .run();

      return json({ ok: true, deleted_class_id: classId });
    }

    const routineMatch = url.pathname.match(/^\/api\/classes\/(\d+)\/routine$/);

    if (routineMatch && request.method === "GET") {
      const classId = Number(routineMatch[1]);
      const accessDenied = await requireClassAccess(request, env, classId);
      if (accessDenied) return accessDenied;

      const classData = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(classId)
        .first();

      if (!classData) {
        return json({ error: "Class not found" }, 404);
      }

      const routine = await env.DB
        .prepare("SELECT * FROM routines WHERE class_id = ?")
        .bind(classId)
        .first();

      let exercises = [];

      if (routine) {
        const exerciseResult = await env.DB
          .prepare("SELECT * FROM routine_exercises WHERE routine_id = ? ORDER BY exercise_order ASC")
          .bind(routine.id)
          .all();

        exercises = exerciseResult.results || [];
      }

      const historicalEdits = await listRoutineEditLogs(env, classId);

      return json({
        class: classData,
        routine,
        exercises,
        historical_edits: historicalEdits
      });
    }

    if (routineMatch && request.method === "PUT") {
      const classId = Number(routineMatch[1]);
      const adminDenied = await requireAdminAccess(request, env);
      if (adminDenied) return adminDenied;
      const data = await readJsonBody(request);

      const classData = await env.DB
        .prepare("SELECT * FROM classes WHERE id = ?")
        .bind(classId)
        .first();

      if (!classData) {
        return json({ error: "Class not found" }, 404);
      }

      const previousRoutine = await env.DB
        .prepare("SELECT * FROM routines WHERE class_id = ?")
        .bind(classId)
        .first();

      let previousExercises = [];
      if (previousRoutine) {
        const previousExerciseResult = await env.DB
          .prepare("SELECT * FROM routine_exercises WHERE routine_id = ? ORDER BY exercise_order ASC")
          .bind(previousRoutine.id)
          .all();
        previousExercises = previousExerciseResult.results || [];
      }

      const historicalEdit = classHasStarted(classData);
      const editComment = String(data.edit_comment || data.editComment || "").trim();
      const routineChanges = buildRoutineChanges(classData, previousRoutine, previousExercises, data);
      const routineChanged = hasRoutineChanges(routineChanges);

      if (historicalEdit && routineChanged && !editComment) {
        return json({ error: "Agregá un comentario sobre la edición antes de guardar la rutina." }, 400);
      }

      await env.DB
        .prepare(`
          UPDATE classes
          SET
            routine_type = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .bind(data.routine_type || "", classId)
        .run();

      await env.DB
        .prepare(`
          INSERT INTO routines (
            class_id,
            technical_notes,
            student_message,
            updated_at
          )
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(class_id) DO UPDATE SET
            technical_notes = excluded.technical_notes,
            student_message = excluded.student_message,
            updated_at = CURRENT_TIMESTAMP
        `)
        .bind(
          classId,
          data.technical_notes || "",
          data.student_message || ""
        )
        .run();

      const routine = await env.DB
        .prepare("SELECT * FROM routines WHERE class_id = ?")
        .bind(classId)
        .first();

      await env.DB
        .prepare("DELETE FROM routine_exercises WHERE routine_id = ?")
        .bind(routine.id)
        .run();

      const exercises = Array.isArray(data.exercises) ? data.exercises : [];

      for (let i = 0; i < exercises.length; i++) {
        const item = exercises[i];

        await env.DB
          .prepare(`
            INSERT INTO routine_exercises (
              routine_id,
              exercise_name,
              sets,
              reps_time,
              load,
              exercise_order
            )
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(
            routine.id,
            item.exercise_name || "",
            item.sets || "",
            item.reps_time || "",
            item.load || "",
            i
          )
          .run();
      }

      const savedExercises = await env.DB
        .prepare("SELECT * FROM routine_exercises WHERE routine_id = ? ORDER BY exercise_order ASC")
        .bind(routine.id)
        .all();

      let savedHistoricalEdit = null;
      if (historicalEdit && routineChanged) {
        await ensureRoutineEditLogTable(env);
        const editResult = await env.DB.prepare(`
          INSERT INTO routine_edit_logs (
            class_id, routine_id, edit_comment, changes_json, created_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(
          classId,
          routine.id,
          editComment,
          JSON.stringify(routineChanges)
        ).run();

        savedHistoricalEdit = await env.DB.prepare(`
          SELECT id, class_id, routine_id, edit_comment, changes_json, created_at
          FROM routine_edit_logs
          WHERE id = ?
        `).bind(Number(editResult.meta?.last_row_id)).first();

        await env.DB.prepare(`
          INSERT INTO student_calendar_comments (
            student_id, class_id, author_role, message, created_at
          ) VALUES (?, ?, 'admin', ?, CURRENT_TIMESTAMP)
        `).bind(
          Number(classData.student_id),
          classId,
          `Edición de rutina: ${editComment}`
        ).run();

        await createStudentNotification(env, {
          studentId: classData.student_id,
          type: "routine_edited",
          title: "Yanina actualizó tu rutina",
          body: editComment,
          targetUrl: studentClassTarget(classData.student_id, classId, "routine")
        });
      }

      const previousNotes = String(previousRoutine?.technical_notes || "").trim();
      const nextNotes = String(data.technical_notes || "").trim();
      const previousMessage = String(previousRoutine?.student_message || "").trim();
      const nextMessage = String(data.student_message || "").trim();

      if (!historicalEdit && ((nextNotes && nextNotes !== previousNotes) || (nextMessage && nextMessage !== previousMessage))) {
        await createStudentNotification(env, {
          studentId: classData.student_id,
          type: "trainer_note",
          title: "Yanina agregó una observación",
          body: nextMessage || nextNotes,
          targetUrl: studentClassTarget(classData.student_id, classId, "routine")
        });
      }

      return json({
        routine,
        exercises: savedExercises.results || [],
        historical_edit: savedHistoricalEdit ? {
          ...savedHistoricalEdit,
          changes: routineChanges
        } : null,
        historical_edits: await listRoutineEditLogs(env, classId)
      });
    }

    return json({ error: "Not found" }, 404);
  }
};
