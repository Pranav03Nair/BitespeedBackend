import { Request, Response } from "express";
import prisma from "../lib/prisma";

export const IdentifyContact = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      return res.status(400).json({
        error: "Incomplete Request: Both email and phoneNumber fields empty",
      });
    }

    const matchingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          email ? { email } : undefined,
          phoneNumber ? { phoneNumber } : undefined,
        ].filter(Boolean) as any,
      },
    });

    return res
      .status(200)
      .json({ message: "Functionality Testing", data: matchingContacts });
    //
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server Error" });
  }
};
