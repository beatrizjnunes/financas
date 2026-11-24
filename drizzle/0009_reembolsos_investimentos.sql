ALTER TABLE `transactions` ADD `is_refund` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `investment_id` text;