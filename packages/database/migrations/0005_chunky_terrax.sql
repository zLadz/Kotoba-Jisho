CREATE INDEX "translations_text_trgm_idx" ON "translations" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "translations_language_idx" ON "translations" USING btree ("language");--> statement-breakpoint
CREATE INDEX "translations_source_source_version_idx" ON "translations" USING btree ("source","source_version");