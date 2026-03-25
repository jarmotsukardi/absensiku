#!/bin/bash

# HR Application - Database Migration Deployment Script
# Tanggal: 2026-03-12
# Purpose: Otomatisasi deployment migration HR ke Supabase

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Migration files
MIGRATION_DIR="supabase/migrations"
MIGRATION_FILES=(
    "20260312_create_hr_approval_types.sql"
    "20260312_enhance_hr_document_templates.sql"
    "20260312_create_hr_leave_management.sql"
)

echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}HR Application - Migration Deploy${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  DATABASE_URL environment variable not set${NC}"
    echo ""
    echo "Please get your database connection string from:"
    echo "  1. https://supabase.com/dashboard"
    echo "  2. Select your project"
    echo "  3. Settings → Database"
    echo "  4. Copy 'Connection string' (URI mode)"
    echo ""
    echo "Then run:"
    echo -e "  ${GREEN}export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'${NC}"
    echo ""
    echo -e "${YELLOW}OR use manual deployment (recommended):${NC}"
    echo "  1. Open docs/DEPLOY-HR-MIGRATION-GUIDE.md"
    echo "  2. Follow step-by-step instructions"
    echo "  3. Copy-paste SQL to Supabase SQL Editor"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ DATABASE_URL is set${NC}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ psql command not found${NC}"
    echo ""
    echo "Please install PostgreSQL client:"
    echo "  - macOS: brew install postgresql"
    echo "  - Ubuntu: sudo apt-get install postgresql-client"
    echo "  - Windows: Download from https://www.postgresql.org/download/windows/"
    echo ""
    echo -e "${YELLOW}OR use manual deployment:${NC}"
    echo "  See docs/DEPLOY-HR-MIGRATION-GUIDE.md"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ psql is available${NC}"
echo ""

# Test database connection
echo -e "${BLUE}Testing database connection...${NC}"
if ! psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
    echo -e "${RED}✗ Failed to connect to database${NC}"
    echo ""
    echo "Please check:"
    echo "  1. DATABASE_URL is correct"
    echo "  2. Password is correct"
    echo "  3. Network connection is active"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Run migrations
echo -e "${BLUE}Running migrations...${NC}"
echo ""

for file in "${MIGRATION_FILES[@]}"; do
    filepath="$MIGRATION_DIR/$file"
    
    if [ ! -f "$filepath" ]; then
        echo -e "${RED}✗ Migration file not found: $filepath${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Running: $file${NC}"
    
    if psql "$DATABASE_URL" -f "$filepath" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Success${NC}"
    else
        echo -e "${RED}  ✗ Failed${NC}"
        echo ""
        echo "Error details:"
        psql "$DATABASE_URL" -f "$filepath" 2>&1 | tail -20
        exit 1
    fi
done

echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}All migrations completed!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""

# Verify tables created
echo -e "${BLUE}Verifying tables...${NC}"
echo ""

TABLES=$(psql "$DATABASE_URL" -t -c "
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN (
        'hr_approval_types', 
        'hr_document_templates', 
        'leave_types', 
        'leave_quotas'
      )
    ORDER BY table_name;
" | grep -v '^$' | wc -l | tr -d ' ')

if [ "$TABLES" -eq 4 ]; then
    echo -e "${GREEN}✓ All 4 tables created successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Only $TABLES/4 tables found${NC}"
    echo "Tables created:"
    psql "$DATABASE_URL" -c "
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN (
            'hr_approval_types', 
            'hr_document_templates', 
            'leave_types', 
            'leave_quotas'
          )
        ORDER BY table_name;
    "
fi

echo ""

# Verify seed data
echo -e "${BLUE}Verifying seed data...${NC}"
echo ""

LEAVE_TYPES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM leave_types;" | tr -d ' ')

if [ "$LEAVE_TYPES" -eq 5 ]; then
    echo -e "${GREEN}✓ Leave types seed data loaded (5 types)${NC}"
else
    echo -e "${YELLOW}⚠️  Leave types count: $LEAVE_TYPES (expected: 5)${NC}"
fi

echo ""

# Show leave types
echo -e "${BLUE}Leave types loaded:${NC}"
psql "$DATABASE_URL" -c "
    SELECT leave_code, leave_name, max_days_per_year 
    FROM leave_types 
    ORDER BY leave_code;
"

echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Test application: http://localhost:5173/org/hr"
echo "  2. Run tests: npx playwright test hr-quick-button-audit.e2e.ts"
echo "  3. Deploy to production"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  - docs/HR-STATUS-FINAL-SUMMARY.md"
echo "  - docs/playwright-audit-report-final.md"
echo ""
