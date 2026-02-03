-- Tạo bảng summary_cards
CREATE TABLE IF NOT EXISTS summary_cards (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  value TEXT NOT NULL,
  sub_value TEXT,
  trend TEXT NOT NULL CHECK (trend IN ('up', 'down')),
  percentage TEXT NOT NULL,
  avg_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo bảng kpi_summary
CREATE TABLE IF NOT EXISTS kpi_summary (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  value TEXT NOT NULL,
  sub_value TEXT,
  trend TEXT NOT NULL CHECK (trend IN ('up', 'down')),
  percentage TEXT NOT NULL,
  avg_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo bảng chart_data
CREATE TABLE IF NOT EXISTS chart_data (
  id BIGSERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  total_dt NUMERIC NOT NULL,
  lumora_dt NUMERIC NOT NULL,
  ads_ratio NUMERIC NOT NULL,
  ln_ratio NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo bảng kpi_performance
CREATE TABLE IF NOT EXISTS kpi_performance (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  actual NUMERIC NOT NULL,
  target NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo bảng team_performance
CREATE TABLE IF NOT EXISTS team_performance (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo bảng individual_ranking
CREATE TABLE IF NOT EXISTS individual_ranking (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  value TEXT NOT NULL,
  rate TEXT NOT NULL,
  mess TEXT NOT NULL,
  orders TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tạo index để tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_summary_cards_created_at ON summary_cards(created_at);
CREATE INDEX IF NOT EXISTS idx_kpi_summary_created_at ON kpi_summary(created_at);
CREATE INDEX IF NOT EXISTS idx_chart_data_month ON chart_data(month);
CREATE INDEX IF NOT EXISTS idx_individual_ranking_team ON individual_ranking(team);

-- Tạo function để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tạo trigger để tự động cập nhật updated_at
CREATE TRIGGER update_summary_cards_updated_at BEFORE UPDATE ON summary_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kpi_summary_updated_at BEFORE UPDATE ON kpi_summary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chart_data_updated_at BEFORE UPDATE ON chart_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kpi_performance_updated_at BEFORE UPDATE ON kpi_performance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_performance_updated_at BEFORE UPDATE ON team_performance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_individual_ranking_updated_at BEFORE UPDATE ON individual_ranking
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
