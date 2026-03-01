@echo off
echo ========================================
echo Starting Orders API (Node.js)
echo ========================================
echo.

cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if .env exists
if not exist ".env" (
    echo.
    echo WARNING: .env file not found!
    echo Please create .env file with:
    echo SUPABASE_URL=https://your-project-id.supabase.co
    echo SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
    echo.
    pause
)

echo.
echo Starting API server...
echo API will be available at: http://localhost:8000
echo Press Ctrl+C to stop
echo.

node orders_api_standalone.js

pause
