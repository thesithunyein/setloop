CREATE TABLE `rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `version` integer DEFAULT 0 NOT NULL,
  `state` text NOT NULL,
  `created` integer NOT NULL,
  `status` text NOT NULL,
  `deadline` integer
);
