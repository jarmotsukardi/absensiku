@echo off
REM HR Application - Database Migration Deployment Script (Windows)
REM Tanggal: 2026-03-12
REM Purpose: Otomatisasi deployment migration HR ke Supabase

echo ==================================
echo HR Application - Migration Deploy
echo ==================================
echo.

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo [WARNING] DATABASE_URL environment variable not set
    echo.
    echo Please get your database connection string from:
    echo   1. https://supabase.com/dashboard
    echo   2. Select your project
    echo   3. Settings ^> Database
    echo   4. Copy 'Connection string' (URI mode)
    echo.
    echo Then set environment variable:
    echo   set DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
    echo.
    echo OR use manual deployment (recommended):
    echo   1. Open docs\DEPLOY-HR-MIGRATION-GUIDE.md
    echo   2. Follow step-by-step instructions
    echo   3. Copy-paste SQL to Supabase SQL Editor
    echo.
    pause
    exit /b 1
)

echo [OK] DATABASE_URL is set
echo.

REM Check if psql is available
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] psql command not found
    echo.
    echo Please install PostgreSQL from:
    echo   https://www.postgresql.org/download/windows/
    echo.
    echo OR use manual deployment:
    echo   See docs\DEPLOY-HR-MIGRATION-GUIDE.md
    echo.
    pause
    exit /b 1
)

echo [OK] psql is available
echo.

REM Test database connection
echo Testing database connection...
psql "%DATABASE_URL%" -c "SELECT 1" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to connect to database
    echo.
    echo Please check:
    echo   1. DATABASE_URL is correct
    echo   2. Password is correct
    echo   3. Network connection is active
    echo.
    pause
    exit /b 1
)

echo [OK] Database connection successful
echo.

REM Run migrations
echo Running migrations...
echo.

set MIGRATION_DIR=supabase\migrations

for %%f in (
    "20260312_create_hr_approval_types.sql"
    "20260312_enhance_hr_document_templates.sql"
    "20260312_create_hr_leave_management.sql"
) do (
    set "filepath=%MIGRATION_DIR%\%%f"
    if not exist "!filepath!" (
        echo [ERROR] Migration file not found: !filepath!
        exit /b 1
    )
    
    echo Running: %%f
    psql "%DATABASE_URL%" -f "!filepath!" >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo   [OK] Success
    ) else (
        echo   [ERROR] Failed
        echo.
        echo Error details:
        psql "%DATABASE_URL%" -f "!filepath!" 2>&1 | more +20
        exit /b 1
    )
)

echo.
echo ==================================
echo All migrations completed!
echo ==================================
echo.

echo Verifying tables...
echo.

psql "%DATABASE_URL%" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('hr_approval_types', 'hr_document_templates', 'leave_types', 'leave_quotas') ORDER BY table_name;"

echo.
echo Verifying seed data...
echo.

psql "%DATABASE_URL%" -c "SELECT COUNT(*) FROM leave_types;"

echo.
echo Leave types loaded:
psql "%DATABASE_URL%" -c "SELECT leave_code, leave_name, max_days_per_year FROM leave_types ORDER BY leave_code;"

echo.
echo ==================================
echo Deployment Complete!
echo ==================================
echo.
echo Next steps:
echo   1. Test application: http://localhost:5173/org/hr
echo   2. Run tests: npx playwright test hr-quick-button-audit.e2e.ts
echo   3. Deploy to production
echo.
echo Documentation:
echo   - docs\HR-STATUS-FINAL-SUMMARY.md
echo   - docs\playwright-audit-report-final.md
echo.

pause
