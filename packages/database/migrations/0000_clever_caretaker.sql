CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jmdict_seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sense_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanji_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"infos" text[],
	"priorities" text[]
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"no_kanji" boolean DEFAULT false NOT NULL,
	"restrictions" text[],
	"infos" text[],
	"priorities" text[]
);
--> statement-breakpoint
CREATE TABLE "senses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"part_of_speech" text[],
	"fields" text[],
	"misc" text[],
	"dialects" text[],
	"kanji_restrictions" text[],
	"reading_restrictions" text[]
);
--> statement-breakpoint
CREATE TABLE "source_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"version" text NOT NULL,
	"checksum" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_sense_id_senses_id_fk" FOREIGN KEY ("sense_id") REFERENCES "public"."senses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanji_forms" ADD CONSTRAINT "kanji_forms_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "senses" ADD CONSTRAINT "senses_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_jmdict_seq_unique" ON "entries" USING btree ("jmdict_seq");--> statement-breakpoint
CREATE INDEX "glosses_sense_id_idx" ON "glosses" USING btree ("sense_id");--> statement-breakpoint
CREATE INDEX "kanji_forms_entry_id_idx" ON "kanji_forms" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "readings_entry_id_idx" ON "readings" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "senses_entry_id_idx" ON "senses" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_imports_source_version_unique" ON "source_imports" USING btree ("source","version");