-- Migration: 0029_add_quick_list_scheduling_columns.sql
-- Description: Add missing scheduling columns to quick_list table if they don't exist

-- Add is_scheduled column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'is_scheduled'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN is_scheduled BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Add frequency column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'frequency'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN frequency TEXT CHECK (frequency IN ('DAILY', 'WEEKLY', 'WEEKLY_3X', 'BIWEEKLY', 'MONTHLY'));
    END IF;
END $$;

-- Add days_of_week column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'days_of_week'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN days_of_week JSONB;
    END IF;
END $$;

-- Add preferred_time column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'preferred_time'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN preferred_time TIME;
    END IF;
END $$;

-- Add next_execution_date column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'next_execution_date'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN next_execution_date DATE;
    END IF;
END $$;

-- Add last_execution_date column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'last_execution_date'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN last_execution_date DATE;
    END IF;
END $$;

-- Add status column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'status'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN status TEXT CHECK (status IN ('ACTIVE', 'PAUSED')) DEFAULT 'ACTIVE';
    END IF;
END $$;

-- Add auto_create_order column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'quick_list' AND column_name = 'auto_create_order'
    ) THEN
        ALTER TABLE quick_list ADD COLUMN auto_create_order BOOLEAN DEFAULT true;
    END IF;
END $$;

