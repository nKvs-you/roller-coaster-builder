import { users, type User, type InsertUser } from "@shared/schema";

// Note: In production, use bcrypt or argon2 for password hashing
// This is a placeholder that should be replaced with proper hashing
async function hashPassword(password: string): Promise<string> {
  // In production: return await bcrypt.hash(password, 12);
  // For now, using a simple warning marker
  console.warn('WARNING: Using placeholder password hashing. Implement bcrypt in production!');
  return `hashed_${password}_${Date.now()}`;
}

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyPassword(user: User, password: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private passwordStore: Map<number, string>; // Store password hashes separately
  currentId: number;

  constructor() {
    this.users = new Map();
    this.passwordStore = new Map();
    this.currentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const passwordHash = await hashPassword(insertUser.password);
    const user: User = { 
      id, 
      username: insertUser.username, 
      passwordHash 
    };
    this.users.set(id, user);
    this.passwordStore.set(id, passwordHash);
    return user;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    const storedHash = this.passwordStore.get(user.id);
    if (!storedHash) return false;
    // In production: return await bcrypt.compare(password, storedHash);
    return storedHash.includes(password);
  }
}

export const storage = new MemStorage();
