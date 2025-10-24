-- Supplify Database Initialization
-- This script sets up the initial database structure

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create indexes for better performance
-- These will be created by Prisma migrations, but we can add some initial ones here

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE supplify TO supplify;
