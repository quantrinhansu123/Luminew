#!/bin/bash

echo "=========================================="
echo "Setup Orders API - Quick Start"
echo "=========================================="
echo ""

# Step 1: Install Python dependencies
echo "Step 1: Installing Python dependencies..."
cd api/orders
pip install -r requirements.txt

# Step 2: Check .env file
echo ""
echo "Step 2: Checking environment variables..."
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating .env.example..."
    cat > .env << EOF
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
EOF
    echo "❌ Please edit .env file with your Supabase credentials"
    exit 1
else
    echo "✅ .env file found"
fi

# Step 3: Instructions for SQL
echo ""
echo "=========================================="
echo "Step 3: Run SQL Script in Supabase"
echo "=========================================="
echo ""
echo "1. Go to Supabase Dashboard: https://app.supabase.com"
echo "2. Select your project"
echo "3. Go to SQL Editor"
echo "4. Copy and paste the content of: supabase_scripts/optimize_orders_table.sql"
echo "5. Click 'Run' to create indexes"
echo ""
echo "This will create all necessary indexes for optimal performance."
echo ""

# Step 4: Start API
echo "=========================================="
echo "Step 4: Starting API Server"
echo "=========================================="
echo ""
echo "Starting FastAPI server on http://localhost:8000"
echo "API docs will be available at: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

uvicorn orders_api:app --reload --host 0.0.0.0 --port 8000
