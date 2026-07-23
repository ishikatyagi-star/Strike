// Doc 4 §2 — store.db (Wavelength). Never joined or queried from strike.db code;
// Strike reaches this data only via /store/api/* (Doc 3 §2 trust boundary).
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  sku: text("sku").primaryKey(),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  priceCents: integer("price_cents").notNull(),
  inStock: integer("in_stock", { mode: "boolean" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    sku: text("sku")
      .notNull()
      .references(() => products.sku),
    quantity: integer("quantity").notNull(),
    amountCents: integer("amount_cents").notNull(),
    cardLast4: text("card_last4").notNull(), // ONLY the last4 — never the PAN/CVV (AGENTS.md Never #3)
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<"captured" | "declined">().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("orders_idempotency_uq").on(t.idempotencyKey)],
);
