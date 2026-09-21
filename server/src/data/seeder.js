import { isMongoConnected } from './mongoose.js';
import {
  UserModel,
  ServiceModel,
  PlaybookModel,
  IncidentModel,
  AuditLogModel,
} from './models.js';

export async function seedMongoIfEmpty(initialData) {
  if (!isMongoConnected()) return;

  try {
    const userCount = await UserModel.countDocuments();
    if (userCount === 0) {
      console.warn('[sentinel] seeding MongoDB with initial platform models...');
      await UserModel.insertMany(initialData.users);
      await ServiceModel.insertMany(initialData.services);
      await PlaybookModel.insertMany(initialData.playbooks);
      await IncidentModel.insertMany(initialData.incidents);
      await AuditLogModel.insertMany(initialData.auditLogs);
      console.warn('[sentinel] MongoDB seeding complete.');
    }
  } catch (err) {
    console.warn('[sentinel] MongoDB seed error:', err.message);
  }
}
