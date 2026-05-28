import { z } from "zod";

/**
 * All notification types the system can generate.
 * These fire on BOTH email and in-app channels -- there is no per-channel
 * or per-type control. Every notification goes to every channel.
 */
export const NotificationType = z.enum([
  "mention",           // @mention in a comment or task description
  "comment_reply",     // reply to a comment the user authored
  "task_assigned",     // user was assigned to a task
  "due_date_reminder", // task due date is approaching (24h, 1h)
  "weekly_digest",     // weekly summary of team activity
  "team_announcement", // admin broadcast to the team
  "system_maintenance", // platform maintenance window alert
]);

export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationChannel = z.enum(["email", "in_app"]);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  type: NotificationType,
  channel: NotificationChannel,
  payload: z.record(z.unknown()).default({}),
  read: z.boolean().default(false),
  sent_at: z.string().datetime(),
});

export type Notification = z.infer<typeof NotificationSchema>;

/**
 * Build the payload for a given notification type.
 * This is called by NotificationService before dispatching.
 */
export function buildNotificationPayload(
  type: NotificationType,
  context: {
    actorName?: string;
    actorId?: string;
    taskId?: string;
    taskTitle?: string;
    commentId?: string;
    commentPreview?: string;
    projectName?: string;
    teamName?: string;
    maintenanceWindow?: { start: string; end: string };
  }
): Record<string, unknown> {
  switch (type) {
    case "mention":
      return {
        actor: context.actorName,
        task: context.taskTitle,
        taskId: context.taskId,
        preview: context.commentPreview,
      };
    case "comment_reply":
      return {
        actor: context.actorName,
        commentId: context.commentId,
        taskId: context.taskId,
        preview: context.commentPreview,
      };
    case "task_assigned":
      // NOTE: There is no corresponding "task_unassigned" notification.
      // When a user is removed from a task, they receive no notification
      // and continue to get comment_reply and due_date_reminder for that task.
      return {
        actor: context.actorName,
        taskId: context.taskId,
        taskTitle: context.taskTitle,
        projectName: context.projectName,
      };
    case "due_date_reminder":
      return {
        taskId: context.taskId,
        taskTitle: context.taskTitle,
        projectName: context.projectName,
      };
    case "weekly_digest":
      return {
        teamName: context.teamName,
        weekOf: new Date().toISOString().split("T")[0],
      };
    case "team_announcement":
      return {
        actor: context.actorName,
        teamName: context.teamName,
      };
    case "system_maintenance":
      return {
        window: context.maintenanceWindow,
      };
  }
}

/**
 * Persist a notification record to the database.
 * Called once per channel (email, in_app) for every notification sent.
 */
export async function insertNotification(
  db: any,
  notification: {
    user_id: string;
    type: NotificationType;
    channel: NotificationChannel;
    payload: Record<string, unknown>;
  }
): Promise<Notification> {
  const rows = await db.query(
    `INSERT INTO notifications (user_id, type, channel, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [notification.user_id, notification.type, notification.channel, JSON.stringify(notification.payload)]
  );
  return NotificationSchema.parse(rows[0]);
}
