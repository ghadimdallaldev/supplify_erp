import 'dotenv/config';
import { query, pool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

async function addMissingColumns() {
  try {
    logger.info('Checking and adding missing columns to quick_list table...');

    // Add is_scheduled column if it doesn't exist
    const checkIsScheduled = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'is_scheduled'
    `);

    if (checkIsScheduled.rows.length === 0) {
      logger.info('Adding is_scheduled column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN is_scheduled BOOLEAN NOT NULL DEFAULT false
      `);
      logger.info('✓ Added is_scheduled column');
    } else {
      logger.info('✓ is_scheduled column already exists');
    }

    // Add frequency column if it doesn't exist
    const checkFrequency = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'frequency'
    `);

    if (checkFrequency.rows.length === 0) {
      logger.info('Adding frequency column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN frequency TEXT CHECK (frequency IN ('DAILY', 'WEEKLY', 'WEEKLY_3X', 'BIWEEKLY', 'MONTHLY'))
      `);
      logger.info('✓ Added frequency column');
    } else {
      logger.info('✓ frequency column already exists');
    }

    // Add days_of_week column if it doesn't exist
    const checkDaysOfWeek = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'days_of_week'
    `);

    if (checkDaysOfWeek.rows.length === 0) {
      logger.info('Adding days_of_week column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN days_of_week JSONB
      `);
      logger.info('✓ Added days_of_week column');
    } else {
      logger.info('✓ days_of_week column already exists');
    }

    // Add preferred_time column if it doesn't exist
    const checkPreferredTime = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'preferred_time'
    `);

    if (checkPreferredTime.rows.length === 0) {
      logger.info('Adding preferred_time column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN preferred_time TIME
      `);
      logger.info('✓ Added preferred_time column');
    } else {
      logger.info('✓ preferred_time column already exists');
    }

    // Add next_execution_date column if it doesn't exist
    const checkNextExecution = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'next_execution_date'
    `);

    if (checkNextExecution.rows.length === 0) {
      logger.info('Adding next_execution_date column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN next_execution_date DATE
      `);
      logger.info('✓ Added next_execution_date column');
    } else {
      logger.info('✓ next_execution_date column already exists');
    }

    // Add last_execution_date column if it doesn't exist
    const checkLastExecution = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'last_execution_date'
    `);

    if (checkLastExecution.rows.length === 0) {
      logger.info('Adding last_execution_date column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN last_execution_date DATE
      `);
      logger.info('✓ Added last_execution_date column');
    } else {
      logger.info('✓ last_execution_date column already exists');
    }

    // Add status column if it doesn't exist
    const checkStatus = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'status'
    `);

    if (checkStatus.rows.length === 0) {
      logger.info('Adding status column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN status TEXT CHECK (status IN ('ACTIVE', 'PAUSED')) DEFAULT 'ACTIVE'
      `);
      logger.info('✓ Added status column');
    } else {
      logger.info('✓ status column already exists');
    }

    // Add auto_create_order column if it doesn't exist
    const checkAutoCreate = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'quick_list' AND column_name = 'auto_create_order'
    `);

    if (checkAutoCreate.rows.length === 0) {
      logger.info('Adding auto_create_order column...');
      await query(`
        ALTER TABLE quick_list 
        ADD COLUMN auto_create_order BOOLEAN DEFAULT true
      `);
      logger.info('✓ Added auto_create_order column');
    } else {
      logger.info('✓ auto_create_order column already exists');
    }

    logger.info('All columns check completed!');
  } catch (error) {
    logger.error('Error adding columns:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addMissingColumns()
  .then(() => {
    logger.info('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });

