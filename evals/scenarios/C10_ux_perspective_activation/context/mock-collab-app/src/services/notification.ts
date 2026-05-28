import sgMail from "@sendgrid/mail";
import {
  NotificationType,
  NotificationChannel,
  buildNotificationPayload,
  insertNotification,
} from "../models/notification";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const EMAIL_TEMPLATES: Record<string, string> = {
  mention: "d-abc001",
  comment_reply: "d-abc002",
  task_assigned: "d-abc003",
  due_date_reminder: "d-abc004",
  weekly_digest: "d-abc005",
  team_announcement: "d-abc006",
  system_maintenance: "d-abc007",
};

interface SendOptions {
  userId: string;
  userEmail: string;
  userName: string;
  type: NotificationType;
  context: Parameters<typeof buildNotificationPayload>[1];
}

/**
 * NotificationService -- the single dispatch path for all notifications.
 *
 * IMPORTANT: This service does NOT check any user preferences before sending.
 * Every notification type is sent to BOTH channels (email + in-app) for
 * every user, unconditionally. There is no preference table, no per-type
 * opt-out, no per-channel control, and no quiet hours.
 *
 * The system sends an average of 23 notifications per day per user.
 * Power users on large teams receive 80+. Email open rates have dropped
 * from 34% to 12% over the past six months.
 */
export class NotificationService {
  private db: any;
  private wsConnections: Map<string, WebSocket>;

  constructor(db: any, wsConnections: Map<string, WebSocket>) {
    this.db = db;
    this.wsConnections = wsConnections;
  }

  /**
   * Send a notification to a user on ALL channels.
   * No preference check. No opt-out. No quiet hours.
   */
  async send(opts: SendOptions): Promise<void> {
    const { userId, userEmail, userName, type, context } = opts;
    const payload = buildNotificationPayload(type, context);

    // Always send email -- no preference check
    await this.sendEmail(userEmail, userName, type, payload);
    await insertNotification(this.db, {
      user_id: userId,
      type,
      channel: "email",
      payload,
    });

    // Always send in-app -- no preference check
    await this.sendInApp(userId, type, payload);
    await insertNotification(this.db, {
      user_id: userId,
      type,
      channel: "in_app",
      payload,
    });
  }

  /**
   * Send notification to all members of a team.
   * Used for team_announcement and system_maintenance.
   * No filtering, no preferences, no opt-out.
   */
  async sendToTeam(
    teamId: string,
    type: NotificationType,
    context: Parameters<typeof buildNotificationPayload>[1]
  ): Promise<void> {
    const members = await this.db.query(
      `SELECT u.id, u.email, u.name FROM users u
       JOIN team_members tm ON tm.user_id = u.id
       WHERE tm.team_id = $1`,
      [teamId]
    );

    // Send to every team member -- no preference check, no batching
    for (const member of members) {
      await this.send({
        userId: member.id,
        userEmail: member.email,
        userName: member.name,
        type,
        context,
      });
    }
  }

  /**
   * Send notifications for task-related events.
   * NOTE: Does NOT check whether the user is still assigned to the task.
   * If a user was previously assigned and then removed, they will continue
   * to receive comment_reply and due_date_reminder notifications for that
   * task because the notification dispatch does not verify current task
   * membership -- it only checks the original task_assigned event.
   */
  async sendTaskNotification(
    taskId: string,
    type: NotificationType,
    context: Parameters<typeof buildNotificationPayload>[1]
  ): Promise<void> {
    // Get the current assignee from the tasks table
    const taskRows = await this.db.query(
      "SELECT assignee_id FROM tasks WHERE id = $1",
      [taskId]
    );

    if (taskRows.length === 0 || !taskRows[0].assignee_id) return;

    const userRows = await this.db.query(
      "SELECT id, email, name FROM users WHERE id = $1",
      [taskRows[0].assignee_id]
    );

    if (userRows.length === 0) return;

    const user = userRows[0];
    await this.send({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      type,
      context: { ...context, taskId },
    });
  }

  private async sendEmail(
    email: string,
    name: string,
    type: NotificationType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const templateId = EMAIL_TEMPLATES[type];
    if (!templateId) return;

    // NOTE: Email does not include an unsubscribe link or List-Unsubscribe header.
    // There is no notification preferences page to link to.
    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL!,
      templateId,
      dynamicTemplateData: {
        userName: name,
        ...payload,
        appUrl: process.env.APP_URL,
      },
    });
  }

  private async sendInApp(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>
  ): Promise<void> {
    const ws = this.wsConnections.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          event: "notification",
          data: { type, payload, timestamp: new Date().toISOString() },
        })
      );
    }
    // If the user is not connected, the notification is still persisted
    // in the database and will be fetched on next page load.
  }
}
