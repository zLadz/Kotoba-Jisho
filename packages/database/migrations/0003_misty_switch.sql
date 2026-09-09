ALTER TABLE "entries" ADD COLUMN "source_import_id" uuid;--> statement-breakpoint
ALTER TABLE "glosses" ADD COLUMN "normalized_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "glosses" ADD COLUMN "source" text DEFAULT 'jmdict' NOT NULL;--> statement-breakpoint
ALTER TABLE "glosses" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "glosses" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "normalized_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "entries_processed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "entries_inserted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "entries_updated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "entries_skipped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "errors" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "source_imports" ADD COLUMN "duration_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_source_import_id_source_imports_id_fk" FOREIGN KEY ("source_import_id") REFERENCES "public"."source_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_source_import_id_idx" ON "entries" USING btree ("source_import_id");--> statement-breakpoint
CREATE INDEX "glosses_normalized_text_idx" ON "glosses" USING btree ("normalized_text");--> statement-breakpoint
CREATE INDEX "glosses_normalized_text_trgm_idx" ON "glosses" USING gin ("normalized_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "readings_normalized_text_idx" ON "readings" USING btree ("normalized_text");--> statement-breakpoint
CREATE INDEX "readings_normalized_text_trgm_idx" ON "readings" USING gin ("normalized_text" gin_trgm_ops);