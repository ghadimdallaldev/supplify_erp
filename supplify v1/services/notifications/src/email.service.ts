import { Injectable } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { createLogger } from '@supplify/utils';

const logger = createLogger('email-service');

@Injectable()
export class EmailService {
  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    }
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      await sgMail.send({
        to,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@supplify.com',
        subject,
        html,
      });
      logger.info(`Email sent to ${to}`);
    } catch (error) {
      logger.error(`Failed to send email: ${error}`);
    }
  }
}

