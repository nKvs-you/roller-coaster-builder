import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  // Note: Password should always be hashed before storage using bcrypt or similar
  passwordHash: text("password_hash").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
}).extend({
  // Password validation: min 8 chars, at least one letter and number
  password: z.string().min(8).regex(/^(?=.*[A-Za-z])(?=.*\d)/, 
    'Password must contain at least one letter and one number'),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
