import { prisma } from "../config/prisma.js";

export class UserModel {
  constructor(data) {
    Object.assign(this, data);
  }

  toPublic() {
    const { passwordHash, ...pub } = this;
    return pub;
  }
}

export function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, verifyToken, verifyTokenExp, ...pub } = user;
  return { ...pub, onboardingDone: pub.onboardingDone || false };
}

export const userStore = {
  async create(data) {
    return prisma.user.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash,
        avatar: data.avatar,
        trustLevel: data.trustLevel ?? 1,
        plan: data.plan ?? "Free",
        city: data.city,
      },
    });
  },

  async get(email) {
    return prisma.user.findUnique({
      where: {
        email: email?.toLowerCase(),
      },
    });
  },

  async getById(id) {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  },

  async has(email) {
    const user = await prisma.user.findUnique({
      where: {
        email: email?.toLowerCase(),
      },
    });

    return !!user;
  },

  async update(email, patch) {
    return prisma.user.update({
      where: {
        email: email.toLowerCase(),
      },
      data: patch,
    });
  },
};
