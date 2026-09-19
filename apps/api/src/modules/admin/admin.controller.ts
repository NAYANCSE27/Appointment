import { Request, Response, NextFunction } from 'express';
import { adminUsersService } from './admin.users.service';
import { adminServicesService } from './admin.services.service';
import { adminProvidersService } from './admin.providers.service';
import { adminSettingsService } from './admin.settings.service';
import type {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  AdminListUsersQuery,
  AdminCreateServiceInput,
  AdminUpdateServiceInput,
  AdminCreateProviderInput,
  AdminUpdateProviderInput,
} from './admin.schemas';

export class AdminController {
  // ==================== User Management ====================

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const query = req.query as unknown as AdminListUsersQuery;

      const result = await adminUsersService.listUsers(tenantId, query);

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const userId = req.params.id;

      const user = await adminUsersService.getUserById(tenantId, userId);

      res.status(200).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body as AdminCreateUserInput;

      const user = await adminUsersService.createUser(tenantId, data);

      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const userId = req.params.id;
      const data = req.body as AdminUpdateUserInput;

      const user = await adminUsersService.updateUser(tenantId, userId, data);

      res.status(200).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  async suspendUser(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const userId = req.params.id;

      const user = await adminUsersService.suspendUser(tenantId, userId);

      res.status(200).json({ success: true, data: user, message: 'User suspended' });
    } catch (error) {
      next(error);
    }
  }

  async reactivateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const userId = req.params.id;

      const user = await adminUsersService.reactivateUser(tenantId, userId);

      res.status(200).json({ success: true, data: user, message: 'User reactivated' });
    } catch (error) {
      next(error);
    }
  }

  async anonymizeUser(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const userId = req.params.id;

      const user = await adminUsersService.anonymizeUser(tenantId, userId);

      res.status(200).json({ success: true, data: user, message: 'User data anonymized' });
    } catch (error) {
      next(error);
    }
  }

  async sendPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const userId = req.params.id;

      const result = await adminUsersService.sendPasswordReset(tenantId, userId);

      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  }

  // ==================== Service Management ====================

  async listServices(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;

      const services = await adminServicesService.listServices(tenantId);

      res.status(200).json({ success: true, data: services });
    } catch (error) {
      next(error);
    }
  }

  async getServiceById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const serviceId = req.params.id;

      const service = await adminServicesService.getServiceById(tenantId, serviceId);

      res.status(200).json({ success: true, data: service });
    } catch (error) {
      next(error);
    }
  }

  async createService(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body as AdminCreateServiceInput;

      const service = await adminServicesService.createService(tenantId, data);

      res.status(201).json({ success: true, data: service });
    } catch (error) {
      next(error);
    }
  }

  async updateService(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const serviceId = req.params.id;
      const data = req.body as AdminUpdateServiceInput;

      const service = await adminServicesService.updateService(tenantId, serviceId, data);

      res.status(200).json({ success: true, data: service });
    } catch (error) {
      next(error);
    }
  }

  async deactivateService(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const serviceId = req.params.id;

      const result = await adminServicesService.deactivateService(tenantId, serviceId);

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // ==================== Provider Management ====================

  async listProviders(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;

      const providers = await adminProvidersService.listProviders(tenantId);

      res.status(200).json({ success: true, data: providers });
    } catch (error) {
      next(error);
    }
  }

  async getProviderById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const providerId = req.params.id;

      const provider = await adminProvidersService.getProviderById(tenantId, providerId);

      res.status(200).json({ success: true, data: provider });
    } catch (error) {
      next(error);
    }
  }

  async createProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body as AdminCreateProviderInput;

      const provider = await adminProvidersService.createProvider(tenantId, data);

      res.status(201).json({ success: true, data: provider });
    } catch (error) {
      next(error);
    }
  }

  async updateProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const providerId = req.params.id;
      const data = req.body as AdminUpdateProviderInput;

      const provider = await adminProvidersService.updateProvider(tenantId, providerId, data);

      res.status(200).json({ success: true, data: provider });
    } catch (error) {
      next(error);
    }
  }

  async deactivateProvider(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const providerId = req.params.id;

      const provider = await adminProvidersService.deactivateProvider(tenantId, providerId);

      res.status(200).json({ success: true, data: provider, message: 'Provider deactivated' });
    } catch (error) {
      next(error);
    }
  }

  // ==================== Settings Management ====================

  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;

      const settings = await adminSettingsService.getTenantSettings(tenantId);

      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body;

      const settings = await adminSettingsService.updateTenantSettings(tenantId, data);

      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  }

  async getWorkingHours(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;

      const workingHours = await adminSettingsService.getWorkingHours(tenantId);

      res.status(200).json({ success: true, data: workingHours });
    } catch (error) {
      next(error);
    }
  }

  async setWorkingHours(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body;

      const workingHours = await adminSettingsService.setWorkingHours(tenantId, data);

      res.status(200).json({ success: true, data: workingHours });
    } catch (error) {
      next(error);
    }
  }

  async getHolidays(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;

      const holidays = await adminSettingsService.getHolidays(tenantId);

      res.status(200).json({ success: true, data: holidays });
    } catch (error) {
      next(error);
    }
  }

  async createHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body;

      const holiday = await adminSettingsService.createHoliday(tenantId, data);

      res.status(201).json({ success: true, data: holiday });
    } catch (error) {
      next(error);
    }
  }

  async deleteHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const holidayId = req.params.id;

      const result = await adminSettingsService.deleteHoliday(tenantId, holidayId);

      res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      next(error);
    }
  }

  async listNotificationTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;

      const templates = await adminSettingsService.listNotificationTemplates(tenantId);

      res.status(200).json({ success: true, data: templates });
    } catch (error) {
      next(error);
    }
  }

  async updateNotificationTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const templateId = req.params.id;
      const data = req.body;

      const template = await adminSettingsService.updateNotificationTemplate(tenantId, templateId, data);

      res.status(200).json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }
}

export const adminController = new AdminController();
