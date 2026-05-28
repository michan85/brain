/**
 * CSV Export — User Activity Report
 *
 * Generates monthly CSV exports consumed by downstream teams:
 *  - Finance team: revenue attribution by user
 *  - Marketing team: user cohort analysis
 *  - Data warehouse: ETL pipeline ingests this CSV nightly
 *  - Partner integrations: 3 partners receive this CSV via SFTP
 *  - Compliance team: audit trail exports
 *
 * IMPORTANT: Downstream consumers parse this CSV by column NAME, not position.
 * The column header `user_id` is a contract. Changing it will break:
 *  - 8 downstream team pipelines that SELECT by column name
 *  - 3 partner SFTP integrations with hardcoded column mappings
 *  - The data warehouse ETL that maps `user_id` to its internal schema
 *
 * Any rename requires coordinated rollout with all consumers.
 */

import { db } from "../db/connection";
import { writeFileSync } from "fs";
import { join } from "path";

const EXPORT_DIR = process.env.EXPORT_DIR ?? "/data/exports";

interface ExportOptions {
  startDate: string;
  endDate: string;
  includeOrders?: boolean;
  includeAudit?: boolean;
}

/**
 * Generate the user activity CSV export.
 * Column order and names are part of the downstream contract.
 */
export function generateUserActivityExport(options: ExportOptions): string {
  const { startDate, endDate, includeOrders = true, includeAudit = false } = options;

  // CSV header — these column names are consumed by 8+ downstream teams
  const headers = [
    "user_id",         // Primary identifier — DO NOT RENAME without coordinating with all consumers
    "email",
    "display_name",
    "created_at",
    "total_orders",
    "lifetime_spend_cents",
    "last_order_at",
    "currency",
  ];

  if (includeAudit) {
    headers.push("total_audit_actions", "last_active_at");
  }

  const rows: string[][] = [];

  const users = db.query(
    `SELECT
       u.user_id,
       u.email,
       u.display_name,
       u.created_at,
       COUNT(DISTINCT o.order_id) AS total_orders,
       COALESCE(SUM(o.total_cents), 0) AS lifetime_spend_cents,
       MAX(o.created_at) AS last_order_at
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.user_id
       AND o.created_at BETWEEN $1 AND $2
     WHERE u.created_at <= $2
       AND u.deleted_at IS NULL
     GROUP BY u.user_id, u.email, u.display_name, u.created_at
     ORDER BY u.user_id`,
    [startDate, endDate]
  );

  for (const user of users) {
    const row = [
      user.user_id,       // Column 0: user_id (UUID string)
      user.email,
      user.display_name,
      user.created_at,
      String(user.total_orders),
      String(user.lifetime_spend_cents),
      user.last_order_at ?? "",
      "USD",
    ];

    if (includeAudit) {
      const auditCount = db.query(
        `SELECT COUNT(*) AS cnt, MAX(created_at) AS last_active
         FROM audit_log
         WHERE user_id = $1 AND created_at BETWEEN $2 AND $3`,
        [user.user_id, startDate, endDate]
      );
      row.push(String(auditCount.cnt), auditCount.last_active ?? "");
    }

    rows.push(row);
  }

  // Build CSV content
  const csvLines = [headers.join(",")];
  for (const row of rows) {
    csvLines.push(row.map(escapeCsvField).join(","));
  }

  return csvLines.join("\n") + "\n";
}

/**
 * Write the export to disk and return the file path.
 * The filename includes the date range for downstream identification.
 */
export function writeExport(options: ExportOptions): string {
  const csv = generateUserActivityExport(options);
  const filename = `user_activity_${options.startDate}_${options.endDate}.csv`;
  const filepath = join(EXPORT_DIR, filename);

  writeFileSync(filepath, csv, "utf-8");
  console.log(`Export written: ${filepath} (${csv.split("\n").length - 1} rows)`);

  return filepath;
}

/**
 * Generate the per-user order detail export.
 * Also uses user_id as the join key in the CSV output.
 */
export function generateOrderDetailExport(userId: string, options: ExportOptions): string {
  const headers = [
    "order_id",
    "user_id",         // Included so downstream systems can verify the join
    "total_cents",
    "currency",
    "status",
    "stripe_charge_id",
    "created_at",
  ];

  const orders = db.query(
    `SELECT order_id, user_id, total_cents, currency, status, stripe_charge_id, created_at
     FROM orders
     WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
     ORDER BY created_at DESC`,
    [userId, options.startDate, options.endDate]
  );

  const csvLines = [headers.join(",")];
  for (const order of orders) {
    csvLines.push(
      [
        order.order_id,
        order.user_id,
        String(order.total_cents),
        order.currency,
        order.status,
        order.stripe_charge_id ?? "",
        order.created_at,
      ]
        .map(escapeCsvField)
        .join(",")
    );
  }

  return csvLines.join("\n") + "\n";
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
