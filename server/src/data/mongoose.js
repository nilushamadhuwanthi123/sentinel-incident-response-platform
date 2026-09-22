import mongoose from 'mongoose';
import { config } from '../config.js';

let isConnected = false;

export async function connectMongo() {
  if (!config.mongoUri) {
    return false;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.warn(`[sentinel] successfully connected to MongoDB: ${config.mongoUri.replace(/:([^:@]+)@/, ':****@')}`);
    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`[sentinel] MongoDB connection failed (${err.message}). Falling back to in-memory store.`);
    return false;
  }
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function disconnectMongo() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
  }
}
