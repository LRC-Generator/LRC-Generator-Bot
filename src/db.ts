/**
 * The Prisma client for lrc.notnick.io's database, which the bot logs its
 * conversions to. The database is optional: without `DATABASE_URL`, `db` is
 * null and nothing is stored.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { optionalEnv } from "./env.js";
import { PrismaClient } from "./generated/prisma/client.js";

const connectionString = optionalEnv("DATABASE_URL");

/** The id of the one row in the Count table: the site's "Requests served". */
export const COUNT_ID = 1;

/**
 * The writes that add one to the requests served, to run in a transaction.
 * Copied from the site's `src/lib/db.ts`: the site's first migration makes the
 * row, and if it's missing the first write makes it at the schema's starting
 * value.
 */
export function countRequest(client: PrismaClient) {
  return [
    client.count.createMany({ data: { id: COUNT_ID }, skipDuplicates: true }),
    client.count.update({
      where: { id: COUNT_ID },
      data: { value: { increment: 1 } },
    }),
  ];
}

export const db: PrismaClient | null = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : null;
