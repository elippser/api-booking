declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        companyId: string;
        role: string;
      };
      guest?: {
        guestId: string;
        email: string;
      };
    }
  }
}

export {};
