import { PrismaClient, Role, DayOfWeek, NotificationChannel, NotificationType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Clinic',
      slug: 'demo',
      timezone: 'America/New_York',
      cancellationNoticeHours: 24,
      smsEnabled: true,
      calendarSyncEnabled: true,
      guestBookingEnabled: true,
    },
  });
  console.log('Tenant created:', tenant.slug);

  // 2. Create Admin
  const adminPassword = await bcrypt.hash('Admin@12345', 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@medibook.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@medibook.com',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: Role.ADMIN,
      isEmailVerified: true,
      isActive: true,
    },
  });
  console.log('Admin created:', admin.email);

  // 3. Create Services
  const servicesData = [
    { name: 'General Checkup', category: 'General Practice', durationMins: 30, priceDecimal: 100.0, color: '#4A90E2' },
    { name: 'Flu Shot', category: 'General Practice', durationMins: 15, priceDecimal: 25.0, color: '#50E3C2' },
    { name: 'Skin Consultation', category: 'Dermatology', durationMins: 45, priceDecimal: 150.0, color: '#F5A623' },
    { name: 'Acne Treatment', category: 'Dermatology', durationMins: 30, priceDecimal: 120.0, color: '#D0021B' },
    { name: 'Pediatric Checkup', category: 'Pediatrics', durationMins: 45, priceDecimal: 110.0, color: '#F8E71C' },
  ];

  const services = [];
  for (const s of servicesData) {
    const service = await prisma.service.create({
      data: {
        tenantId: tenant.id,
        ...s,
      },
    });
    services.push(service);
  }
  console.log('Services created:', services.length);

  // 4. Create Providers
  const providerPassword = await bcrypt.hash('Provider@123', 12);
  
  const p1User = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'dr.smith@medibook.com',
      passwordHash: providerPassword,
      firstName: 'John',
      lastName: 'Smith',
      role: Role.PROVIDER,
      isEmailVerified: true,
    }
  });

  const p1 = await prisma.provider.create({
    data: {
      tenantId: tenant.id,
      userId: p1User.id,
      specialty: 'General Practice',
      bio: 'Experienced general practitioner.',
      services: {
        create: [
          { serviceId: services[0].id },
          { serviceId: services[1].id }
        ]
      }
    }
  });

  const p2User = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'dr.jane@medibook.com',
      passwordHash: providerPassword,
      firstName: 'Jane',
      lastName: 'Doe',
      role: Role.PROVIDER,
      isEmailVerified: true,
    }
  });

  const p2 = await prisma.provider.create({
    data: {
      tenantId: tenant.id,
      userId: p2User.id,
      specialty: 'Dermatology',
      bio: 'Specialist in skin health.',
      services: {
        create: [
          { serviceId: services[2].id },
          { serviceId: services[3].id }
        ]
      }
    }
  });
  console.log('Providers created.');

  // 5. Clinic Working Hours
  const days = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
  for (const day of days) {
    await prisma.clinicWorkingHours.upsert({
      where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek: day } },
      update: {},
      create: {
        tenantId: tenant.id,
        dayOfWeek: day,
        openTime: '08:00',
        closeTime: '18:00',
        isClosed: false,
      }
    });
  }
  console.log('Clinic working hours created.');

  // 6. Notification Templates (basic defaults)
  const types = Object.values(NotificationType);
  const channels = [NotificationChannel.EMAIL, NotificationChannel.SMS];
  
  for (const type of types) {
    for (const channel of channels) {
      // Skipping some combinations if SMS is only for specific types, but PRD says all combinations
      await prisma.notificationTemplate.upsert({
        where: { tenantId_type_channel: { tenantId: tenant.id, type, channel } },
        update: {},
        create: {
          tenantId: tenant.id,
          type,
          channel,
          subject: channel === NotificationChannel.EMAIL ? `MediBook: ${type}` : undefined,
          bodyHtml: channel === NotificationChannel.EMAIL ? `<p>This is a ${type} notification.</p>` : undefined,
          bodySms: channel === NotificationChannel.SMS ? `MediBook: This is a ${type} notification.` : undefined,
          variables: {},
        }
      });
    }
  }
  console.log('Notification templates created.');

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
