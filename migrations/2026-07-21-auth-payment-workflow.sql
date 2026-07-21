BEGIN;

-- Legacy and current passwords use the same SHA-256 hexadecimal format.
-- Preserve every password and only normalize the flags that made legacy rows
-- return PASSWORD_NOT_SET.
UPDATE student_accounts
SET password_requires_reset = 0,
    password_setup_version = 1,
    setup_code = NULL,
    setup_code_created_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE length(password_hash) = 64
  AND lower(password_hash) NOT GLOB '*[^0-9a-f]*';

-- Keep the credential-bearing account active when an older duplicate differs
-- only by username casing. No credential is replaced or generated.
UPDATE student_accounts AS duplicate
SET is_active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(duplicate.password_hash, '') = ''
  AND EXISTS (
    SELECT 1
    FROM student_accounts AS credential
    WHERE credential.student_id = duplicate.student_id
      AND credential.id <> duplicate.id
      AND lower(credential.username) = lower(duplicate.username)
      AND length(credential.password_hash) = 64
      AND lower(credential.password_hash) NOT GLOB '*[^0-9a-f]*'
  );

-- Retired profiles must not leave a usable orphan login behind.
UPDATE student_accounts AS account
SET is_active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM students WHERE students.id = account.student_id
);

-- Students who never created a password need the normal one-time setup path.
-- This creates setup codes, never passwords.
UPDATE student_accounts
SET setup_code = upper(hex(randomblob(4))),
    setup_code_created_at = CURRENT_TIMESTAMP,
    password_requires_reset = 1,
    password_setup_version = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(is_active, 1) = 1
  AND COALESCE(password_hash, '') = ''
  AND COALESCE(setup_code, '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_accounts_active_username_nocase
ON student_accounts(lower(username))
WHERE COALESCE(is_active, 1) = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_accounts_active_student
ON student_accounts(student_id)
WHERE COALESCE(is_active, 1) = 1;

-- Saving or materially updating a pending resumen must light the student's
-- notification bell and point to that exact persisted bill.
CREATE TRIGGER IF NOT EXISTS payment_summary_notify_student_insert
AFTER INSERT ON payment_summaries
WHEN NEW.status = 'pending'
BEGIN
  INSERT INTO notifications (
    recipient_role, student_id, type, title, body, target_url, is_read, created_at
  ) VALUES (
    'student',
    NEW.student_id,
    'payment_summary_pending',
    'Nuevo resumen pendiente',
    'Tu resumen de ' || NEW.month || ' ya esta disponible.',
    'alumno/pago.html?id=' || CAST(NEW.student_id AS TEXT) || '&month=' || NEW.month,
    0,
    CURRENT_TIMESTAMP
  );
END;

CREATE TRIGGER IF NOT EXISTS payment_summary_notify_student_update
AFTER UPDATE OF classes_count, class_value, other_value, total_value, status, class_dates
ON payment_summaries
WHEN NEW.status = 'pending'
  AND (
    OLD.status IS NOT NEW.status
    OR OLD.classes_count IS NOT NEW.classes_count
    OR OLD.class_value IS NOT NEW.class_value
    OR OLD.other_value IS NOT NEW.other_value
    OR OLD.total_value IS NOT NEW.total_value
    OR OLD.class_dates IS NOT NEW.class_dates
  )
BEGIN
  INSERT INTO notifications (
    recipient_role, student_id, type, title, body, target_url, is_read, created_at
  ) VALUES (
    'student',
    NEW.student_id,
    'payment_summary_pending',
    'Resumen pendiente actualizado',
    'Tu resumen de ' || NEW.month || ' fue actualizado.',
    'alumno/pago.html?id=' || CAST(NEW.student_id AS TEXT) || '&month=' || NEW.month,
    0,
    CURRENT_TIMESTAMP
  );
END;

COMMIT;
