-- Create design_order_status enum
CREATE TYPE "public"."design_order_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED');

-- Create design_orders table
CREATE TABLE "public"."design_orders" (
  "id" TEXT NOT NULL,
  "customer_name" VARCHAR(100) NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "product_type" VARCHAR(100) NOT NULL,
  "requirements" TEXT NOT NULL,
  "designer" VARCHAR(100) NOT NULL DEFAULT '',
  "status" "public"."design_order_status" NOT NULL DEFAULT 'PENDING',
  "revenue" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  "deadline" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "design_orders_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "idx_design_orders_status" ON "public"."design_orders"("status");
CREATE INDEX "idx_design_orders_created" ON "public"."design_orders"("created_at" DESC);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_design_orders_updated_at BEFORE UPDATE ON "public"."design_orders"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
