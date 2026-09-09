CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "glosses_text_trgm_idx" ON "glosses" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "kanji_forms_text_trgm_idx" ON "kanji_forms" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "readings_text_trgm_idx" ON "readings" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "readings_romaji_trgm_idx" ON "readings" USING gin ("romaji" gin_trgm_ops);