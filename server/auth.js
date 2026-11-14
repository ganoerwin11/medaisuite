import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "./db.js";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
export const ROLES = ["admin", "staff"];
export const FALLBACK_ADMIN_ID = "fallback-admin";

export async function hashPassword(password) {
  return bcrypt.hash(String(password), SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(String(password || ""), String(hash || ""));
}

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function sanitizeUser(user) {
  if (!user) return null;
  const plain = typeof user.get === "function" ? user.get({ plain: true }) : user;
  const { passwordHash, ...rest } = plain;
  return rest;
}

function extractToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

// Lazily builds the demo administrator used only while PostgreSQL is not connected,
// mirroring the in-memory fallback data used elsewhere in the server (orders, calls, questions).
let fallbackAdminPromise = null;
export function getFallbackAdmin() {
  if (!fallbackAdminPromise) {
    fallbackAdminPromise = hashPassword(process.env.ADMIN_PASSWORD || "ChangeMe123!").then(
      (passwordHash) => ({
        id: FALLBACK_ADMIN_ID,
        fullName: process.env.ADMIN_NAME || "Clinic Administrator",
        email: (process.env.ADMIN_EMAIL || "admin@clinic.local").toLowerCase(),
        passwordHash,
        role: "admin",
        active: true,
      }),
    );
  }
  return fallbackAdminPromise;
}

// Creates the initial administrator account from environment variables when no users exist yet.
export async function ensureDefaultAdmin() {
  const count = await User.count();
  if (count > 0) return null;

  const email = (process.env.ADMIN_EMAIL || "admin@clinic.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const fullName = process.env.ADMIN_NAME || "Clinic Administrator";

  const passwordHash = await hashPassword(password);
  const admin = await User.create({ fullName, email, passwordHash, role: "admin", active: true });

  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      `No ADMIN_PASSWORD was set. Created default admin ${email} with a temporary password. ` +
        "Set ADMIN_EMAIL/ADMIN_PASSWORD in .env and change this password immediately.",
    );
  }

  return admin;
}

// Looks up a user by email, using PostgreSQL when connected, otherwise the in-memory demo admin.
export async function findUserForLogin(email, isDatabaseReady) {
  if (isDatabaseReady()) return User.findOne({ where: { email } });
  const fallback = await getFallbackAdmin();
  return fallback.email === email ? fallback : null;
}

// Builds auth middleware bound to the server's current database-connection state, so
// authentication keeps working in the same offline demo mode as the rest of the app.
export function createAuthMiddleware(isDatabaseReady) {
  async function requireAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ message: "Authentication required." });
    }

    try {
      const payload = verifyToken(token);
      let user;
      if (payload.sub === FALLBACK_ADMIN_ID) {
        user = isDatabaseReady() ? null : await getFallbackAdmin();
      } else {
        user = isDatabaseReady() ? await User.findByPk(payload.sub) : null;
      }
      if (!user || !user.active) {
        return res.status(401).json({ message: "Invalid or expired session." });
      }
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired session." });
    }
  }

  // Must run after requireAuth. Restricts access to the given roles.
  function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res
          .status(403)
          .json({ message: "You do not have permission to perform this action." });
      }
      next();
    };
  }

  return { requireAuth, requireRole };
}
