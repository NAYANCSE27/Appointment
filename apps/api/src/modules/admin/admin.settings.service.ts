import { prisma } from '../../config/prisma';

export class AdminSettingsService {
  /**
   * Get tenant settings
   */
  async getTenantSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        workingHours: {
          orderBy: { dayOfWeek: 'asc' },
        },
        holidays: {
          where: { date: { gte: new Date() } },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    return tenant;
  }

  /**
   * Update tenant settings
   */
  async updateTenantSettings(tenantId: string, data: any) {
    const updateData: any = {};

    if (data.name) updateData.name = data.name;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.timezone) updateData.timezone = data.timezone;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl || null;
    if (data.cancellationNoticeHours !== undefined) updateData.cancellationNoticeHours = data.cancellationNoticeHours;
    if (data.smsEnabled !== undefined) updateData.smsEnabled = data.smsEnabled;
    if (data.calendarSyncEnabled !== undefined) updateData.calendarSyncEnabled = data.calendarSyncEnabled;
    if (data.guestBookingEnabled !== undefined) updateData.guestBookingEnabled = data.guestBookingEnabled;

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    return tenant;
  }

  /**
   * Get clinic working hours
   */
  async getWorkingHours(tenantId: string) {
    const workingHours = await prisma.clinicWorkingHours.findMany({
      where: { tenantId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return workingHours;
  }

  /**
   * Set working hours for a day
   */
  async setWorkingHours(tenantId: string, data: any) {
    const workingHours = await prisma.clinicWorkingHours.upsert({
      where: {
        tenantId_dayOfWeek: {
          tenantId,
          dayOfWeek: data.dayOfWeek,
        },
      },
      create: {
        tenantId,
        dayOfWeek: data.dayOfWeek,
        openTime: data.openTime,
        closeTime: data.closeTime,
        isClosed: data.isClosed || false,
      },
      update: {
        openTime: data.openTime,
        closeTime: data.closeTime,
        isClosed: data.isClosed,
      },
    });

    return workingHours;
  }

  /**
   * Get clinic holidays
   */
  async getHolidays(tenantId: string) {
    const holidays = await prisma.clinicHoliday.findMany({
      where: { tenantId },
      orderBy: { date: 'asc' },
    });

    return holidays;
  }

  /**
   * Create a clinic holiday
   */
  async createHoliday(tenantId: string, data: any) {
    const holiday = await prisma.clinicHoliday.create({
      data: {
        tenantId,
        date: new Date(data.date),
        name: data.name,
      },
    });

    return holiday;
  }

  /**
   * Delete a clinic holiday
   */
  async deleteHoliday(tenantId: string, holidayId: string) {
    await prisma.clinicHoliday.delete({
      where: { id: holidayId },
    });

    return { message: 'Holiday deleted successfully' };
  }

  /**
   * List notification templates
   */
  async listNotificationTemplates(tenantId: string) {
    const templates = await prisma.notificationTemplate.findMany({
      where: { tenantId },
      orderBy: [{ type: 'asc' }, { channel: 'asc' }],
    });

    return templates;
  }

  /**
   * Update notification template
   */
  async updateNotificationTemplate(tenantId: string, templateId: string, data: any) {
    const template = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, tenantId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const updateData: any = {};
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.bodyHtml !== undefined) updateData.bodyHtml = data.bodyHtml;
    if (data.bodySms !== undefined) updateData.bodySms = data.bodySms;
    if (data.variables !== undefined) updateData.variables = data.variables;

    const updated = await prisma.notificationTemplate.update({
      where: { id: templateId },
      data: updateData,
    });

    return updated;
  }
}

export const adminSettingsService = new AdminSettingsService();
