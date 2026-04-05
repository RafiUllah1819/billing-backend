-- Migration: Add inventory control fields to products
-- Run once against your database.

ALTER TABLE products ADD COLUMN IF NOT EXISTS category       VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku            VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS opening_stock  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS opening_stock_rate NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Unique SKU only when a value is actually set (allows multiple NULLs / empty strings)
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique
  ON products(sku)
  WHERE sku IS NOT NULL AND sku <> '';
