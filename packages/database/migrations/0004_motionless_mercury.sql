CREATE TABLE "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sense_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"source_version" text DEFAULT '' NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_sense_id_senses_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "translations_sense_id_idx" ON "translations" USING btree ("sense_id");--> statement-breakpoint
CREATE INDEX "translations_normalized_text_idx" ON "translations" USING btree ("normalized_text");--> statement-breakpoint
CREATE INDEX "translations_normalized_text_trgm_idx" ON "translations" USING gin ("normalized_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "translations_sense_language_text_source_unique" ON "translations" USING btree ("sense_id","language","text","source","source_version");