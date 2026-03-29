-- Migration: Add X Score accuracy tracking tables
-- Run once against Supabase: psql $DATABASE_URL -f migrate-accuracy.sql

-- Add new columns to analysts table
ALTER TABLE analysts
  ADD COLUMN IF NOT EXISTS x_score NUMERIC,
  ADD COLUMN IF NOT EXISTS x_score_rank INTEGER,
  ADD COLUMN IF NOT EXISTS x_score_sites_count INTEGER,
  ADD COLUMN IF NOT EXISTS x_score_last_updated TIMESTAMP,
  ADD COLUMN IF NOT EXISTS tier INTEGER;

-- Create analyst_accuracy_scores table
CREATE TABLE IF NOT EXISTS analyst_accuracy_scores (
  id SERIAL PRIMARY KEY,
  analyst_id INTEGER NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
  site TEXT NOT NULL,           -- 'thr' | 'fp' | 'wf' | 'nflmdd' | 'gtm'
  year INTEGER NOT NULL,        -- 2021-2025+
  raw_score NUMERIC,            -- native units per site
  site_rank INTEGER,            -- rank on that site that year
  z_score NUMERIC,              -- computed after all scores loaded
  notes TEXT,
  UNIQUE(analyst_id, site, year)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_aas_analyst ON analyst_accuracy_scores(analyst_id);
CREATE INDEX IF NOT EXISTS idx_aas_site_year ON analyst_accuracy_scores(site, year);
