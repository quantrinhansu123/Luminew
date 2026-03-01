@echo off
echo ==========================================
echo Starting Orders API
echo ==========================================
echo.

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found!
    echo.
    echo Please create .env file with:
    echo SUPABASE_URL=https://your-project-id.supabase.co
    echo SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
    echo.
    pause
    exit /b 1
)

echo Starting API server on http://localhost:8000
echo API docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop
echo.

python orders_api_simple.py

pause
